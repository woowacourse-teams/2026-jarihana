package com.project.jarihana.sparring.stream;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.postgresql.PGConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Properties;

@Component
@ConditionalOnExpression("${sparring.benchmark.listen:${sparring.benchmark.notify:false}}")
class SparringBenchmarkListener {
    private static final Logger log = LoggerFactory.getLogger(SparringBenchmarkListener.class);

    private final SparringStreams streams;
    private final String url;
    private final Properties connectionProperties = new Properties();
    private final Counter received;
    private final Counter dropped;
    private final String dropRevision;
    private final Thread listener =
            Thread.ofPlatform().daemon().name("sparring-listen").unstarted(this::listen);

    SparringBenchmarkListener(
            SparringStreams streams,
            MeterRegistry meters,
            @Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username}") String username,
            @Value("${spring.datasource.password}") String password,
            @Value("${sparring.benchmark.drop-revision:}") String dropRevision) {
        this.streams = streams;
        this.url = url;
        connectionProperties.setProperty("user", username);
        connectionProperties.setProperty("password", password);
        connectionProperties.setProperty("connectTimeout", "5");
        connectionProperties.setProperty("socketTimeout", "5");
        connectionProperties.setProperty("ApplicationName", "sparring-benchmark-listener");
        this.dropRevision = dropRevision;
        this.dropped = meters.counter("sparring.benchmark.notifications.dropped");
        this.received = meters.counter("sparring.benchmark.notifications.received");
    }

    @PostConstruct
    void start() {
        listener.start();
    }

    private void listen() {
        while (!Thread.currentThread().isInterrupted()) {
            try (var connection = DriverManager.getConnection(url, connectionProperties);
                    var statement = connection.createStatement()) {
                statement.execute("LISTEN sparring_benchmark_revision");
                // LISTEN commits in autocommit mode. Recover changes committed while disconnected.
                streams.markAllChanged();
                log.info("Listening for sparring benchmark notifications");
                var postgres = connection.unwrap(PGConnection.class);
                while (!Thread.currentThread().isInterrupted()) {
                    var notifications = postgres.getNotifications(1000);
                    if (notifications == null) continue;
                    for (var notification : notifications) {
                        received.increment();
                        String payload = notification.getParameter();
                        int separator = payload.indexOf(':');
                        if (separator < 1) continue;
                        if (payload.substring(separator + 1).equals(dropRevision)) {
                            dropped.increment();
                            continue;
                        }
                        try {
                            streams.markChanged(Long.parseLong(payload.substring(0, separator)));
                        } catch (NumberFormatException ignored) {
                            // A malformed notification cannot interrupt the listener.
                        }
                    }
                }
            } catch (SQLException exception) {
                if (Thread.currentThread().isInterrupted()) return;
                log.warn("Sparring benchmark listener disconnected (SQL state {})",
                        exception.getSQLState());
                try {
                    Thread.sleep(Duration.ofSeconds(1));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    @PreDestroy
    void stop() {
        listener.interrupt();
    }
}

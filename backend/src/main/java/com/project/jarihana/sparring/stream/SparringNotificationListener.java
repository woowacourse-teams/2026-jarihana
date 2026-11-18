package com.project.jarihana.sparring.stream;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.postgresql.PGConnection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.Properties;

@Component
class SparringNotificationListener {
    private static final Logger log = LoggerFactory.getLogger(SparringNotificationListener.class);

    private final SparringStreams streams;
    private final String url;
    private final Properties connectionProperties = new Properties();
    private final Counter received;
    private final Thread listener =
            Thread.ofPlatform().daemon().name("sparring-listen").unstarted(this::listen);
    private volatile boolean running;
    private volatile Connection connection;

    SparringNotificationListener(
            SparringStreams streams,
            MeterRegistry meters,
            @Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username:}") String username,
            @Value("${spring.datasource.password:}") String password) {
        this.streams = streams;
        this.url = url;
        connectionProperties.setProperty("user", username);
        connectionProperties.setProperty("password", password);
        connectionProperties.setProperty("connectTimeout", "5");
        connectionProperties.setProperty("socketTimeout", "5");
        connectionProperties.setProperty("ApplicationName", "sparring-notification-listener");
        this.received = meters.counter("sparring.notifications.received");
    }

    @PostConstruct
    void start() {
        running = true;
        listener.start();
    }

    private void listen() {
        while (running) {
            // LISTEN needs a persistent session without occupying the application's connection pool.
            try (var current = DriverManager.getConnection(url, connectionProperties)) {
                connection = current;
                if (!running) return;
                current.setAutoCommit(true);
                try (var statement = current.createStatement()) {
                    statement.execute("LISTEN sparring_revision");
                }
                // Recover changes committed before LISTEN became active, including disconnections.
                streams.markAllChanged();
                log.info("Listening for sparring notifications");
                var postgres = current.unwrap(PGConnection.class);
                receiveNotifications(postgres);
            } catch (SQLException | RuntimeException exception) {
                if (!running) return;
                log.warn("Sparring notification listener disconnected", exception);
            } finally {
                connection = null;
            }
            if (running) {
                try {
                    Thread.sleep(Duration.ofSeconds(1));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    private void receiveNotifications(PGConnection postgres) throws SQLException {
        while (running) {
            var notifications = postgres.getNotifications(1000);
            if (notifications == null) continue;
            for (var notification : notifications) {
                received.increment();
                try {
                    streams.markChanged(Long.parseLong(notification.getParameter()));
                } catch (NumberFormatException ignored) {
                    // A malformed notification cannot interrupt the listener.
                }
            }
        }
    }

    @PreDestroy
    void stop() {
        running = false;
        listener.interrupt();
        Connection current = connection;
        if (current != null) {
            try {
                current.close();
            } catch (SQLException exception) {
                log.warn("Sparring notification connection close failed", exception);
            }
        }
        try {
            listener.join(6000);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}

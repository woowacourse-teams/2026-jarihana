package com.project.jarihana.chat.client;

import io.micrometer.core.instrument.MeterRegistry;

import org.postgresql.PGConnection;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Properties;

@Component("chatListener")
public class ChatPostgresListener implements SmartLifecycle, HealthIndicator {
    private final ChatEventDispatcher dispatcher;
    private final MeterRegistry metrics;
    private final String url;
    private final Properties properties = new Properties();
    private final boolean enabled;
    private final long reconnectDelay;
    private volatile boolean running;
    private volatile boolean listening;
    private volatile Connection connection;
    private Thread thread;

    public ChatPostgresListener(
            ChatEventDispatcher dispatcher,
            MeterRegistry metrics,
            @Value("${spring.datasource.url}") String url,
            @Value("${spring.datasource.username:}") String username,
            @Value("${spring.datasource.password:}") String password,
            @Value("${chat.listener.enabled:true}") boolean enabled,
            @Value("${chat.listener.application-name:jarihana-chat-listener}")
                    String applicationName,
            @Value("${chat.listener.reconnect-delay-ms:1000}") long reconnectDelay) {
        this.dispatcher = dispatcher;
        this.metrics = metrics;
        this.url = url;
        this.enabled = enabled;
        this.reconnectDelay = Math.max(100, reconnectDelay);
        properties.setProperty("user", username);
        properties.setProperty("password", password);
        properties.setProperty("connectTimeout", "5");
        properties.setProperty("socketTimeout", "15");
        properties.setProperty("ApplicationName", applicationName);
        metrics.gauge("chat.listener.connected", this, value -> value.listening ? 1 : 0);
    }

    @Override
    public synchronized void start() {
        if (running || !enabled) return;
        running = true;
        thread = new Thread(this::listen, "chat-postgres-listener");
        thread.setDaemon(true);
        thread.start();
    }

    private void listen() {
        while (running) {
            try (Connection current = DriverManager.getConnection(url, properties)) {
                connection = current;
                current.setAutoCommit(true);
                try (var statement = current.createStatement()) {
                    statement.execute("LISTEN jarihana_chat");
                }
                PGConnection pg = current.unwrap(PGConnection.class);
                listening = true;
                metrics.counter("chat.listener.connections").increment();
                dispatcher.resync();
                while (running) {
                    var notifications = pg.getNotifications(1000);
                    if (notifications == null) continue;
                    for (var notification : notifications) {
                        try {
                            dispatcher.dispatch(notification.getParameter());
                        } catch (RuntimeException failure) {
                            metrics.counter("chat.listener.dispatch.failure").increment();
                            dispatcher.resync();
                        }
                    }
                }
            } catch (Exception failure) {
                if (running) metrics.counter("chat.listener.failure").increment();
            } finally {
                listening = false;
                connection = null;
            }
            if (running) {
                try {
                    Thread.sleep(reconnectDelay);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    @Override
    public synchronized void stop() {
        running = false;
        listening = false;
        Connection current = connection;
        if (current != null) {
            try {
                current.close();
            } catch (Exception failure) {
                metrics.counter("chat.listener.close.failure").increment();
            }
        }
        if (thread != null) {
            thread.interrupt();
            try {
                thread.join(6000);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public Health health() {
        return listening ? Health.up().build() : Health.down().build();
    }
}

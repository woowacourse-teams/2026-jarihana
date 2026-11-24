package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.room.runtime.RoomRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "realtime", name = "enabled", havingValue = "true")
final class RoomChangeListener {
    private static final Logger log = LoggerFactory.getLogger(RoomChangeListener.class);
    private static final long VALIDATION_INTERVAL = TimeUnit.SECONDS.toNanos(5);
    private final RealtimeProperties properties;
    private final RoomRegistry rooms;
    private final ExecutorService workers = Executors.newFixedThreadPool(RealtimeEnvironment.values().length,
            Thread.ofPlatform().daemon().name("room-notification-", 0).factory());

    RoomChangeListener(RealtimeProperties properties, RoomRegistry rooms) {
        this.properties = properties;
        this.rooms = rooms;
    }

    @PostConstruct
    void start() {
        for (RealtimeEnvironment environment : RealtimeEnvironment.values()) {
            workers.execute(() -> run(environment));
        }
    }

    private void run(RealtimeEnvironment environment) {
        boolean failureLogged = false;
        while (!Thread.currentThread().isInterrupted()) {
            try (Connection connection = connect(environment)) {
                subscribe(connection);
                // LISTEN must commit before reading current state. Changes committed during reconciliation stay queued.
                rooms.reconcileNotifications(environment);
                PGConnection listener = connection.unwrap(PGConnection.class);
                handleNotifications(environment, listener.getNotifications());
                rooms.notificationsReady(environment);
                log.info("Realtime change listener subscribed environment={}", environment);
                failureLogged = false;

                long lastValidation = System.nanoTime();
                while (!Thread.currentThread().isInterrupted()) {
                    handleNotifications(environment, listener.getNotifications(1000));
                    if (System.nanoTime() - lastValidation >= VALIDATION_INTERVAL) {
                        if (!connection.isValid(2)) throw new SQLException("Notification connection failed validation");
                        lastValidation = System.nanoTime();
                    }
                }
            } catch (SQLException | RuntimeException error) {
                rooms.notificationsDisconnected(environment);
                if (!failureLogged && !Thread.currentThread().isInterrupted()) {
                    log.warn("Realtime change listener will reconnect environment={} failure={}", environment,
                            error instanceof SQLException sql ? sql.getSQLState() : error.getClass().getSimpleName());
                    failureLogged = true;
                }
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    private Connection connect(RealtimeEnvironment environment) throws SQLException {
        var settings = properties.environment(environment);
        Properties options = new Properties();
        options.setProperty("user", settings.dbUsername());
        options.setProperty("password", settings.dbPassword());
        options.setProperty("ApplicationName", "jarihana-realtime-listener");
        options.setProperty("connectTimeout", "3");
        options.setProperty("socketTimeout", "5");
        options.setProperty("tcpKeepAlive", "true");
        return DriverManager.getConnection(settings.dbJdbcUrl(), options);
    }

    private static void subscribe(Connection connection) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.execute("LISTEN jarihana_space_change");
            try (var result = statement.executeQuery("SELECT to_regprocedure('jarihana_notify_space_change()') IS NOT NULL")) {
                if (!result.next() || !result.getBoolean(1)) throw new SQLException("Room change triggers are missing");
            }
        }
    }

    private void handleNotifications(RealtimeEnvironment environment, PGNotification[] notifications) {
        if (notifications == null) return;
        for (var notification : notifications) {
            String payload = notification.getParameter();
            String[] parts = payload.split(":", -1);
            if (payload.equals("catalog")) {
                rooms.catalogChanged(environment);
            } else if (parts.length == 2 && isId(parts[1])) {
                switch (parts[0]) {
                    case "layout" -> rooms.layoutChanged(environment, parts[1]);
                    case "member" -> rooms.permissionsChanged(environment, null, parts[1]);
                    case "room" -> rooms.permissionsChanged(environment, parts[1], null);
                    default -> { }
                }
            } else if (parts.length == 3 && parts[0].equals("membership") && isId(parts[1]) && isId(parts[2])) {
                rooms.permissionsChanged(environment, parts[1], parts[2]);
            }
        }
    }

    private static boolean isId(String value) {
        try {
            return Long.parseLong(value) > 0;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    @PreDestroy
    void stop() {
        workers.shutdownNow();
    }
}

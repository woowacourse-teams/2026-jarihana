package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.config.RealtimeProperties.EnvironmentSettings;
import com.zaxxer.hikari.HikariDataSource;
import com.zaxxer.hikari.metrics.micrometer.MicrometerMetricsTrackerFactory;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import java.util.EnumMap;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
final class RealtimeDatabases {
    private final Map<RealtimeEnvironment, Database> databases = new EnumMap<>(RealtimeEnvironment.class);

    RealtimeDatabases(RealtimeProperties properties, MeterRegistry metrics) {
        if (properties.enabled()) {
            var tracker = new MicrometerMetricsTrackerFactory(metrics);
            for (RealtimeEnvironment environment : RealtimeEnvironment.values()) {
                databases.put(environment, open(environment, properties.environment(environment), tracker));
            }
        }
    }

    JdbcClient client(RealtimeEnvironment environment) {
        return databases.get(environment).client();
    }

    private static Database open(RealtimeEnvironment environment, EnvironmentSettings settings,
            MicrometerMetricsTrackerFactory tracker) {
        HikariDataSource pool = new HikariDataSource();
        pool.setPoolName("realtime-" + environment.name().toLowerCase(java.util.Locale.ROOT));
        pool.setJdbcUrl(settings.dbJdbcUrl());
        pool.setUsername(settings.dbUsername());
        pool.setPassword(settings.dbPassword());
        pool.setReadOnly(true);
        pool.setMaximumPoolSize(4);
        pool.setMinimumIdle(0);
        pool.setConnectionTimeout(3000);
        pool.setInitializationFailTimeout(-1);
        pool.setMetricsTrackerFactory(tracker);
        JdbcTemplate template = new JdbcTemplate(pool);
        template.setQueryTimeout(3);
        return new Database(pool, JdbcClient.create(template));
    }

    @PreDestroy
    void close() {
        databases.values().forEach(database -> database.pool().close());
    }

    private record Database(HikariDataSource pool, JdbcClient client) {}
}

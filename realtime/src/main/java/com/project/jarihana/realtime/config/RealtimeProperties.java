package com.project.jarihana.realtime.config;

import java.time.Clock;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@ConfigurationProperties("realtime")
public record RealtimeProperties(@DefaultValue("false") boolean enabled,
        @DefaultValue EnvironmentSettings dev, @DefaultValue EnvironmentSettings prod,
        @DefaultValue("60s") Duration leaseValidity,
        @DefaultValue("http://localhost:5173") String allowedOrigins,
        @DefaultValue("128") int maxRooms, @DefaultValue("24") int roomCapacity,
        @DefaultValue("256") int maxItems, @DefaultValue("1024") int maxConnections,
        @DefaultValue("256") int roomQueueCapacity, @DefaultValue("262144") int outboundBytes,
        @DefaultValue("5000") long authenticationTimeoutMs, @DefaultValue("5000") long reconnectGraceMs,
        @DefaultValue("20000") long refreshIntervalMs, @DefaultValue("30000") long heartbeatTimeoutMs) {
    public RealtimeProperties {
        if (maxRooms < 1 || roomCapacity < 1 || maxItems < 1 || maxConnections < 1 || roomQueueCapacity < 8 ||
                outboundBytes < 1024 || authenticationTimeoutMs < 100 || reconnectGraceMs < 0 ||
                refreshIntervalMs < 100 || heartbeatTimeoutMs < 1000) {
            throw new IllegalArgumentException("Realtime limits must be positive and bounded");
        }
        if (leaseValidity.compareTo(Duration.ofSeconds(10)) < 0 || leaseValidity.compareTo(Duration.ofMinutes(5)) > 0) {
            throw new IllegalArgumentException("Realtime access lease must be between 10 seconds and 5 minutes");
        }
        if (enabled) {
            dev.requireConfigured(RealtimeEnvironment.DEV);
            prod.requireConfigured(RealtimeEnvironment.PROD);
            if (dev.dbJdbcUrl().equals(prod.dbJdbcUrl()) || allowedOrigins.isBlank() || allowedOrigins.contains("*")) {
                throw new IllegalArgumentException("Enabled realtime requires distinct DB URLs and explicit origins");
            }
        }
    }

    public EnvironmentSettings environment(RealtimeEnvironment environment) {
        return switch (environment) {
            case DEV -> dev;
            case PROD -> prod;
        };
    }

    public record EnvironmentSettings(@DefaultValue("") String tokenKey, @DefaultValue("") String dbJdbcUrl,
            @DefaultValue("") String dbUsername, @DefaultValue("") String dbPassword) {
        private void requireConfigured(RealtimeEnvironment environment) {
            if (tokenKey.isBlank() || !dbJdbcUrl.startsWith("jdbc:postgresql:") || dbUsername.isBlank() || dbPassword.isBlank()) {
                throw new IllegalArgumentException("Missing realtime key or PostgreSQL settings for " + environment);
            }
        }

        @Override
        public String toString() {
            return "EnvironmentSettings[redacted]";
        }
    }

    @Configuration
    public static class TimeConfiguration {
        @Bean
        Clock realtimeClock() { return Clock.systemUTC(); }
    }
}

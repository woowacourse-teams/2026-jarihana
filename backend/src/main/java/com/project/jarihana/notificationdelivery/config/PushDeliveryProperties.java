package com.project.jarihana.notificationdelivery.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("jarihana.push.delivery")
public record PushDeliveryProperties(
        Integer maxInFlight,
        Integer ioThreads,
        Integer dnsThreads,
        Integer dnsQueueCapacity,
        Integer maxConnectionsPerRoute,
        Integer maxConnections,
        Duration poolWaitTimeout,
        Duration idleTimeout,
        Duration connectionTimeToLive,
        Duration shutdownTimeout
) {
    public PushDeliveryProperties {
        maxInFlight = bounded(maxInFlight, 4, 100);
        ioThreads = bounded(ioThreads, 1, 8);
        dnsThreads = bounded(dnsThreads, 2, 8);
        dnsQueueCapacity = bounded(dnsQueueCapacity, 4, 100);
        maxConnectionsPerRoute = bounded(maxConnectionsPerRoute, 4, 100);
        maxConnections = bounded(maxConnections, 12, 300);
        if (maxConnectionsPerRoute > maxConnections) {
            throw new IllegalArgumentException("호스트별 연결 수는 전체 연결 수를 초과할 수 없습니다.");
        }
        poolWaitTimeout = duration(poolWaitTimeout, Duration.ofSeconds(1));
        idleTimeout = duration(idleTimeout, Duration.ofSeconds(60));
        connectionTimeToLive = duration(connectionTimeToLive, Duration.ofMinutes(5));
        shutdownTimeout = duration(shutdownTimeout, Duration.ofSeconds(15));
    }

    public static PushDeliveryProperties defaults() {
        return new PushDeliveryProperties(null, null, null, null, null, null, null, null, null, null);
    }

    private static int bounded(Integer value, int defaultValue, int maximum) {
        int resolved = value == null ? defaultValue : value;
        if (resolved < 1 || resolved > maximum) {
            throw new IllegalArgumentException("푸시 실행 자원 설정이 허용 범위를 벗어났습니다.");
        }
        return resolved;
    }

    private static Duration duration(Duration value, Duration defaultValue) {
        Duration resolved = value == null ? defaultValue : value;
        if (resolved.compareTo(Duration.ofMillis(1)) < 0 || resolved.compareTo(Duration.ofHours(1)) > 0) {
            throw new IllegalArgumentException("푸시 실행 제한 시간은 1ms 이상 1시간 이하여야 합니다.");
        }
        return resolved;
    }
}

package com.project.jarihana.notification.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "jarihana.notification")
public record NotificationProperties(Duration deliveryTtl) {

    public NotificationProperties {
        deliveryTtl = deliveryTtl == null ? Duration.ofHours(24) : deliveryTtl;
        if (deliveryTtl.isZero() || deliveryTtl.isNegative()) {
            throw new IllegalArgumentException("알림 전송 유효기간은 양수여야 합니다.");
        }
    }
}

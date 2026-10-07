package com.project.jarihana.pushsubscription.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;
import java.util.List;
import java.util.Locale;

@ConfigurationProperties(prefix = "jarihana.push")
public record PushProperties(boolean enabled, boolean workerEnabled, String vapidPublicKey, String vapidPrivateKey,
                             String vapidSubject, List<String> allowedHosts, Integer batchSize, Duration leaseDuration,
                             Duration requestTimeout, Duration connectTimeout, Duration retryDelay) {
    public PushProperties {
        allowedHosts = allowedHosts == null ? List.of("fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com")
                : allowedHosts.stream().map(host -> host.toLowerCase(Locale.ROOT)).distinct().toList();
        batchSize = batchSize == null ? 50 : batchSize;
        leaseDuration = leaseDuration == null ? Duration.ofMinutes(1) : leaseDuration;
        requestTimeout = requestTimeout == null ? Duration.ofSeconds(10) : requestTimeout;
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(5) : connectTimeout;
        retryDelay = retryDelay == null ? Duration.ofSeconds(5) : retryDelay;
        if (batchSize < 1 || batchSize > 100 || leaseDuration.isNegative() || leaseDuration.isZero()
                || requestTimeout.isNegative() || requestTimeout.isZero() || connectTimeout.isNegative()
                || connectTimeout.isZero() || retryDelay.isNegative() || retryDelay.isZero()
                || requestTimeout.toMillis() < 1 || connectTimeout.toMillis() < 1
                || leaseDuration.compareTo(requestTimeout.plus(connectTimeout.multipliedBy(2))) <= 0
                || requestTimeout.compareTo(Duration.ofMinutes(1)) > 0
                || connectTimeout.compareTo(requestTimeout) > 0 || leaseDuration.compareTo(Duration.ofHours(1)) > 0
                || retryDelay.compareTo(Duration.ofHours(1)) > 0 || allowedHosts.isEmpty()
                || allowedHosts.stream().anyMatch(host -> !host.matches("(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?")
                    || !host.contains(".") || host.matches("[0-9.]+"))) {
            throw new IllegalArgumentException("푸시 처리량·시간 설정이 유효하지 않습니다.");
        }
        if (enabled && (vapidPublicKey == null || vapidPrivateKey == null || vapidSubject == null
                || vapidPublicKey.isBlank() || vapidPrivateKey.isBlank() || vapidSubject.isBlank())) {
            throw new IllegalArgumentException("웹푸시 활성화에는 VAPID 공개키·비밀키·연락처가 필요합니다.");
        }
    }

    @Override
    public String toString() {
        return "PushProperties[enabled=" + enabled + ", workerEnabled=" + workerEnabled + "]";
    }
}

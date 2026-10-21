package com.project.jarihana.image.config;

import java.time.Duration;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.image")
public record ImageProperties(
        String bucket,
        String region,
        String keyPrefix,
        String publicBaseUrl,
        String deliveryBaseUrl,
        String cloudFrontKeyPairId,
        String cloudFrontPrivateKey,
        Duration presignedUrlExpiration,
        Duration accessUrlExpiration,
        long maxFileSize,
        Set<String> allowedContentTypes,
        boolean cleanupEnabled,
        Duration cleanupGracePeriod,
        Duration cleanupLease,
        int cleanupBatchSize,
        long cleanupIntervalMs
) {

    public ImageProperties {
        bucket = defaultString(bucket, "techcourse-project-2026");
        region = defaultString(region, "ap-northeast-2");
        keyPrefix = defaultString(keyPrefix, "jarihana/images");
        publicBaseUrl = defaultString(publicBaseUrl, "");
        deliveryBaseUrl = defaultString(deliveryBaseUrl, "");
        cloudFrontKeyPairId = defaultString(cloudFrontKeyPairId, "");
        cloudFrontPrivateKey = defaultString(cloudFrontPrivateKey, "");
        presignedUrlExpiration = presignedUrlExpiration == null ? Duration.ofMinutes(30) : presignedUrlExpiration;
        accessUrlExpiration = accessUrlExpiration == null ? Duration.ofMinutes(5) : accessUrlExpiration;
        maxFileSize = maxFileSize <= 0 ? 5 * 1024 * 1024 : maxFileSize;
        allowedContentTypes = allowedContentTypes == null || allowedContentTypes.isEmpty()
                ? Set.of("image/jpeg", "image/png", "image/webp")
                : Set.copyOf(allowedContentTypes);
        cleanupGracePeriod = cleanupGracePeriod == null ? Duration.ofDays(7) : cleanupGracePeriod;
        cleanupLease = cleanupLease == null ? Duration.ofMinutes(15) : cleanupLease;
        cleanupBatchSize = cleanupBatchSize <= 0 ? 100 : cleanupBatchSize;
        cleanupIntervalMs = cleanupIntervalMs <= 0 ? 3_600_000L : cleanupIntervalMs;
    }

    private static String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}

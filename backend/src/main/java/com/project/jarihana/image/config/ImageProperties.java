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
        Duration presignedUrlExpiration,
        long maxFileSize,
        Set<String> allowedContentTypes
) {

    public ImageProperties {
        bucket = defaultString(bucket, "techcourse-project-2026");
        region = defaultString(region, "ap-northeast-2");
        keyPrefix = defaultString(keyPrefix, "jarihana/images");
        publicBaseUrl = defaultString(publicBaseUrl, "");
        presignedUrlExpiration = presignedUrlExpiration == null ? Duration.ofMinutes(10) : presignedUrlExpiration;
        maxFileSize = maxFileSize <= 0 ? 5 * 1024 * 1024 : maxFileSize;
        allowedContentTypes = allowedContentTypes == null || allowedContentTypes.isEmpty()
                ? Set.of("image/jpeg", "image/png", "image/webp")
                : Set.copyOf(allowedContentTypes);
    }

    private static String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}

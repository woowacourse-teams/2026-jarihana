package com.project.jarihana.member.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.auth")
public record AuthProperties(
        String frontendOrigin,
        String refreshCookieName,
        String refreshCookiePath,
        Duration refreshTokenValidity,
        boolean cookieSecure
) {
}

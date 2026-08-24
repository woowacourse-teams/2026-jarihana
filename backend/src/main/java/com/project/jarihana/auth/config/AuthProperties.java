package com.project.jarihana.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "jarihana.auth")
public record AuthProperties(
        String frontendOrigin,
        String oauthStateCookieName,
        Duration refreshTokenValidity
) {
}

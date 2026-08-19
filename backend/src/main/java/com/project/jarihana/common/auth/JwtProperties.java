package com.project.jarihana.common.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.auth.jwt")
public record JwtProperties(
        String secret,
        Duration validity,
        String cookieName,
        String cookiePath
) {
}

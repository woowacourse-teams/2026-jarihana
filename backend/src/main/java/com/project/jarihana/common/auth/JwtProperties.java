package com.project.jarihana.common.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Validated
@ConfigurationProperties(prefix = "jarihana.auth.jwt")
public record JwtProperties(
        @NotBlank
        @Size(min = 32)
        String secret,
        Duration validity
) {
}

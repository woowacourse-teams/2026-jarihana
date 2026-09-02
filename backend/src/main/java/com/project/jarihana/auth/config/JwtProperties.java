package com.project.jarihana.auth.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * Access Token 서명과 유효 기간을 소유한다.
 *
 * <p>{@code secret}은 HMAC-SHA256 서명 키라 최소 32바이트가 필요하다. 짧은 키는
 * {@code Keys.hmacShaKeyFor}가 기동이 아니라 첫 발급 시점에 거부한다.
 *
 * <p>{@code validity}가 없으면 토큰 발급이 NPE로 끊긴다.
 */
@Validated
@ConfigurationProperties(prefix = "jarihana.auth.jwt")
public record JwtProperties(
        @NotBlank
        @Size(min = 32)
        String secret,
        @NotNull
        Duration validity
) {
}

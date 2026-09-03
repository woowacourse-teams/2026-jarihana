package com.project.jarihana.auth.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * {@code @Validated}가 필요한 이유:
 *
 * <p>검증이 없으면 값이 비어도 애플리케이션은 그대로 뜨고, 첫 로그인을 할 때서야 문제가 드러난다.
 * {@code refreshTokenValidity}가 없으면 토큰 발급이 NPE가 나고, {@code frontendOrigin}이
 * 없으면 OAuth 콜백이 어떤 페이지로 돌아가야 하는지 알 수 없게 된다.
 */
@Validated
@ConfigurationProperties(prefix = "jarihana.auth")
public record AuthProperties(
        @NotBlank
        @Pattern(regexp = "^https?://[^/]+$")
        String frontendOrigin,

        @NotBlank
        String oauthStateCookieName,

        @NotNull
        Duration refreshTokenValidity
) {
}

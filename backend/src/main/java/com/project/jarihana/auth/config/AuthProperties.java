package com.project.jarihana.auth.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * 인증 기능이 쓰는 설정값을 소유한다. 하나라도 비면 기동 단계에서 멈춘다.
 *
 * <p>검증이 없으면 값이 비어도 애플리케이션은 그대로 뜨고, 첫 로그인에서야 문제가 드러난다.
 * {@code refreshTokenValidity}가 없으면 토큰 발급이 NPE로 끊기고, {@code frontendOrigin}이
 * 없으면 OAuth 콜백이 되돌아갈 곳을 잃는다. 늦게 아는 것보다 뜨지 않는 편이 낫다.
 *
 * <p>{@code frontendOrigin}에는 뒤에 콜백 경로를 덧붙이므로 scheme을 갖춘 origin이어야 하고
 * 끝에 슬래시가 붙으면 안 된다. {@code localhost:5173}처럼 scheme이 없으면
 * {@code UriComponentsBuilder}가 "localhost"를 scheme으로 읽어 엉뚱한 주소를 만들고,
 * 끝에 슬래시가 있으면 경로가 이어 붙으며 슬래시가 겹친다.
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

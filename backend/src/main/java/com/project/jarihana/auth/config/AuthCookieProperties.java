package com.project.jarihana.auth.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * 자격 증명 쿠키의 이름, 경로와 보안 속성을 소유한다.
 *
 * <p>Access Token 쿠키는 인증 필터가 읽고 Refresh Token 쿠키는 재발급 경로가 읽는다. 두 쿠키를
 * 내리는 곳이 기능마다 흩어져 있어 속성 정의는 한곳에 모아 둔다.
 *
 * <p>{@code secure}는 원시 타입이 아닌 {@code Boolean}으로 받는다. 원시 타입이면 키를 빠뜨리거나
 * 이름을 틀렸을 때 조용히 {@code false}로 묶여, 운영에서 Secure 속성 없는 자격 증명 쿠키가
 * 나가도 아무 신호가 없다. 감싼 타입이어야 기동이 실패해 실수를 그 자리에서 알 수 있다.
 *
 * <p>경로는 슬래시로 시작해야 한다. RFC 6265는 그렇지 않은 Path 속성을 무시하고 요청 URI에서
 * 유도한 기본 경로를 쓰라고 정하므로, 오타가 나면 쿠키가 의도한 범위 밖으로 퍼진다.
 */
@Validated
@ConfigurationProperties(prefix = "jarihana.auth.cookie")
public record AuthCookieProperties(
        @NotNull
        Boolean secure,

        @NotBlank
        String accessTokenName,

        @NotBlank
        @Pattern(regexp = "^/.*")
        String accessTokenPath,

        @NotBlank
        String refreshTokenName,

        @NotBlank
        @Pattern(regexp = "^/.*")
        String refreshTokenPath
) {
}

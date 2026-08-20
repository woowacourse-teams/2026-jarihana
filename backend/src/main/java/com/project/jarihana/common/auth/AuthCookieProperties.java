package com.project.jarihana.common.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 자격 증명 쿠키의 이름, 경로와 보안 속성을 소유한다.
 *
 * <p>Access Token 쿠키는 인증 필터가 읽고 Refresh Token 쿠키는 재발급 경로가 읽는다. 두 쿠키를
 * 내리는 곳이 기능마다 흩어져 있어 속성 정의는 한곳에 모아 둔다.
 */
@ConfigurationProperties(prefix = "jarihana.auth.cookie")
public record AuthCookieProperties(
        boolean secure,
        String accessTokenName,
        String accessTokenPath,
        String refreshTokenName,
        String refreshTokenPath
) {
}

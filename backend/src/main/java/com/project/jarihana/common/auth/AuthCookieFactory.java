package com.project.jarihana.common.auth;

import com.project.jarihana.auth.config.AuthProperties;
import java.time.Duration;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * 자격 증명 쿠키의 보안 속성을 한곳에서 정한다.
 *
 * <p>OAuth 콜백과 가입 완료 두 곳에서 같은 토큰 쿠키를 내리므로, 속성이 갈리지 않도록 모아 둔다.
 */
@Component
public class AuthCookieFactory {

    private static final String SAME_SITE_LAX = "Lax";

    private final AuthProperties authProperties;
    private final JwtProperties jwtProperties;

    public AuthCookieFactory(AuthProperties authProperties, JwtProperties jwtProperties) {
        this.authProperties = authProperties;
        this.jwtProperties = jwtProperties;
    }

    public ResponseCookie accessToken(String value, Duration validity) {
        return ResponseCookie.from(jwtProperties.cookieName(), value)
                .httpOnly(true)
                .secure(authProperties.cookieSecure())
                .sameSite(SAME_SITE_LAX)
                .path(jwtProperties.cookiePath())
                .maxAge(validity)
                .build();
    }

    public ResponseCookie refreshToken(String value, Duration validity) {
        return ResponseCookie.from(authProperties.refreshCookieName(), value)
                .httpOnly(true)
                .secure(authProperties.cookieSecure())
                .sameSite(SAME_SITE_LAX)
                .path(authProperties.refreshCookiePath())
                .maxAge(validity)
                .build();
    }
}

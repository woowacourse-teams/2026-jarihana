package com.project.jarihana.auth.cookie;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.IssuedAccessToken;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * 자격 증명 쿠키의 보안 속성을 한곳에서 정한다.
 *
 * <p>OAuth 콜백과 가입 완료 두 곳에서 같은 토큰 쿠키를 내리므로, 속성이 갈리지 않도록 모아 둔다.
 */
@Component
public class AuthCookieFactory {

    private static final String SAME_SITE_LAX = "Lax";

    private final AuthCookieProperties authCookieProperties;

    public AuthCookieFactory(AuthCookieProperties authCookieProperties) {
        this.authCookieProperties = authCookieProperties;
    }

    /**
     * 로그아웃처럼 자격 증명을 거둬들일 때 쓴다. 발급할 때와 같은 이름과 경로여야 브라우저가
     * 기존 쿠키를 지운다.
     */
    public ResponseCookie expiredAccessToken() {
        return accessToken("", Duration.ZERO);
    }

    public ResponseCookie accessToken(IssuedAccessToken accessToken) {
        return accessToken(accessToken.value(), accessToken.validity());
    }

    private ResponseCookie accessToken(String value, Duration validity) {
        return ResponseCookie.from(authCookieProperties.accessTokenName(), value)
                .httpOnly(true)
                .secure(authCookieProperties.secure())
                .sameSite(SAME_SITE_LAX)
                .path(authCookieProperties.accessTokenPath())
                .maxAge(validity)
                .build();
    }
    public ResponseCookie expiredRefreshToken() {
        return refreshToken("", Duration.ZERO);
    }

    public ResponseCookie refreshToken(String value, Duration validity) {
        return ResponseCookie.from(authCookieProperties.refreshTokenName(), value)
                .httpOnly(true)
                .secure(authCookieProperties.secure())
                .sameSite(SAME_SITE_LAX)
                .path(authCookieProperties.refreshTokenPath())
                .maxAge(validity)
                .build();
    }
}

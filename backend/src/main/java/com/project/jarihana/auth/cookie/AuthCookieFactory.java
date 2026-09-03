package com.project.jarihana.auth.cookie;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.IssuedAccessToken;
import com.project.jarihana.auth.token.IssuedRefreshToken;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class AuthCookieFactory {

    private static final String SAME_SITE_LAX = "Lax";

    private final AuthCookieProperties authCookieProperties;

    public AuthCookieFactory(AuthCookieProperties authCookieProperties) {
        this.authCookieProperties = authCookieProperties;
    }

    /**
     * 발급할 때와 같은 이름과 경로여야 브라우저가 기존 쿠키를 지운다.
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

    public ResponseCookie refreshToken(IssuedRefreshToken refreshToken) {
        return refreshToken(refreshToken.value(), refreshToken.validity());
    }

    private ResponseCookie refreshToken(String value, Duration validity) {
        return ResponseCookie.from(authCookieProperties.refreshTokenName(), value)
                .httpOnly(true)
                .secure(authCookieProperties.secure())
                .sameSite(SAME_SITE_LAX)
                .path(authCookieProperties.refreshTokenPath())
                .maxAge(validity)
                .build();
    }
}

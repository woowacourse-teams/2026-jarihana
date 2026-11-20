package com.project.jarihana.auth.command.service.dto;

import com.project.jarihana.auth.token.IssuedAccessToken;
import com.project.jarihana.auth.token.IssuedRefreshToken;

import java.util.Optional;

/**
 * 회전 직후 같은 Refresh Token이 다시 오면 Access Token만 발급하므로 {@code rotatedRefreshToken}은 비어 있을 수
 * 있다. 이때 브라우저의 Refresh Token 쿠키는 먼저 성공한 응답이 이미 새 값으로 바꾸어 두었다.
 */
public record RefreshResult(IssuedAccessToken accessToken, IssuedRefreshToken rotatedRefreshToken) {

    public static RefreshResult rotated(IssuedAccessToken accessToken, IssuedRefreshToken rotatedRefreshToken) {
        return new RefreshResult(accessToken, rotatedRefreshToken);
    }

    public static RefreshResult accessTokenOnly(IssuedAccessToken accessToken) {
        return new RefreshResult(accessToken, null);
    }

    public Optional<IssuedRefreshToken> findRotatedRefreshToken() {
        return Optional.ofNullable(rotatedRefreshToken);
    }
}

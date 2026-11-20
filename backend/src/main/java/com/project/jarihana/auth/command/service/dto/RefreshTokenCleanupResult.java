package com.project.jarihana.auth.command.service.dto;

/**
 * 정리 한 번에 지운 행 수다. {@code familyTokens}는 지운 패밀리에 속했던 토큰, {@code legacyTokens}는 패밀리
 * 없이 저장된 이전 토큰이다.
 */
public record RefreshTokenCleanupResult(int families, int familyTokens, int legacyTokens) {

    public boolean isEmpty() {
        return families == 0 && familyTokens == 0 && legacyTokens == 0;
    }
}

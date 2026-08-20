package com.project.jarihana.auth.command.controller.dto;

import com.project.jarihana.auth.command.service.dto.RefreshResult;

/**
 * Access Token 값은 담지 않는다. HttpOnly 쿠키로 전달하므로 본문에 실으면 JavaScript가 읽을 수
 * 있어 ADR 0002의 결정이 무의미해진다. 프론트엔드가 다음 재발급 시점을 잡을 수 있도록 남은
 * 유효 기간만 초 단위로 준다.
 */
public record RefreshResponse(long expiresIn) {

    public static RefreshResponse from(RefreshResult result) {
        return new RefreshResponse(result.accessToken().validity().toSeconds());
    }
}

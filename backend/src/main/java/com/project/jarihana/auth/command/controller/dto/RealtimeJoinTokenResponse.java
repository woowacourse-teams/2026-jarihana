package com.project.jarihana.auth.command.controller.dto;

import com.project.jarihana.auth.token.IssuedRealtimeJoinToken;

public record RealtimeJoinTokenResponse(String token, String websocketUrl, long expiresAt) {
    public static RealtimeJoinTokenResponse from(IssuedRealtimeJoinToken token) {
        return new RealtimeJoinTokenResponse(token.token(), token.websocketUrl(), token.expiresAt());
    }

    @Override
    public String toString() {
        return "RealtimeJoinTokenResponse[token=[REDACTED], expiresAt=" + expiresAt + "]";
    }
}

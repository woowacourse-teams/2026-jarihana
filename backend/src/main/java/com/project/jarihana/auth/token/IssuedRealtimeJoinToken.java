package com.project.jarihana.auth.token;

public record IssuedRealtimeJoinToken(String token, String websocketUrl, long expiresAt) {
    @Override
    public String toString() {
        return "IssuedRealtimeJoinToken[token=[REDACTED], expiresAt=" + expiresAt + "]";
    }
}

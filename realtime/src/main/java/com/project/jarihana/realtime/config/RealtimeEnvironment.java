package com.project.jarihana.realtime.config;

public enum RealtimeEnvironment {
    DEV("jarihana-api-dev"),
    PROD("jarihana-api-prod");

    private final String issuer;

    RealtimeEnvironment(String issuer) {
        this.issuer = issuer;
    }

    public String issuer() {
        return issuer;
    }
}

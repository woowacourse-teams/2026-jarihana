package com.project.jarihana.invitation.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Map;

@ConfigurationProperties(prefix = "jarihana.invitation.token")
public record InvitationTokenProperties(String activeKeyId, Map<String, String> keys) {
    public InvitationTokenProperties {
        activeKeyId = activeKeyId == null ? "" : activeKeyId;
        keys = keys == null ? Map.of() : Map.copyOf(keys);
    }

    @Override
    public String toString() { return "InvitationTokenProperties[configured=" + !keys.isEmpty() + "]"; }
}

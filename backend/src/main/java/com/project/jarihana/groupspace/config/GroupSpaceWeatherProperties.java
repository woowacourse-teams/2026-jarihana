package com.project.jarihana.groupspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("jarihana.group-space.weather")
public record GroupSpaceWeatherProperties(boolean enabled, String apiKey) {
    public GroupSpaceWeatherProperties {
        apiKey = apiKey == null ? "" : apiKey.trim();
    }

    @Override
    public String toString() {
        return "GroupSpaceWeatherProperties[enabled=" + enabled + ", apiKey=redacted]";
    }
}

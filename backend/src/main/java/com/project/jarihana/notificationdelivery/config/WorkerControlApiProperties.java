package com.project.jarihana.notificationdelivery.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.worker-control")
public record WorkerControlApiProperties(String token, String version) {

    public WorkerControlApiProperties {
        token = token == null ? "" : token;
        version = version == null || version.isBlank() ? "unknown" : version;
    }

    @Override
    public String toString() {
        return "WorkerControlApiProperties[token=[REDACTED], version=" + version + "]";
    }
}

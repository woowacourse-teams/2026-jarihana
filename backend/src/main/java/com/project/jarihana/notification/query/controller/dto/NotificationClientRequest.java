package com.project.jarihana.notification.query.controller.dto;

import com.project.jarihana.notification.query.service.dto.NotificationClientVersion;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record NotificationClientRequest(@Min(1) @Max(2) Integer clientVersion) {

    public NotificationClientRequest {
        clientVersion = clientVersion == null ? 1 : clientVersion;
    }

    public NotificationClientVersion toVersion() {
        return NotificationClientVersion.from(clientVersion);
    }
}

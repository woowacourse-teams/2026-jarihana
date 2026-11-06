package com.project.jarihana.notification.command.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record NotificationReadAllRequest(@Min(1) @Max(3) Integer clientVersion) {

    public NotificationReadAllRequest {
        clientVersion = clientVersion == null ? 1 : clientVersion;
    }

    public boolean includesChat() {
        return clientVersion == 3;
    }

    public boolean includesAnnouncements() {
        return clientVersion >= 2;
    }
}

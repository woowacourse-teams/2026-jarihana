package com.project.jarihana.notification.command.controller.dto;

import com.project.jarihana.notification.command.service.dto.NotificationReadAllResult;

import java.time.LocalDateTime;

public record NotificationReadAllResponse(int updatedCount, LocalDateTime readAt) {
    public static NotificationReadAllResponse from(NotificationReadAllResult result) {
        return new NotificationReadAllResponse(result.updatedCount(), result.readAt());
    }
}

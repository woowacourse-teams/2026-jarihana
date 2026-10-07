package com.project.jarihana.notification.command.controller.dto;

import com.project.jarihana.notification.command.service.dto.NotificationReadResult;

import java.time.LocalDateTime;

public record NotificationReadResponse(long id, LocalDateTime readAt) {
    public static NotificationReadResponse from(NotificationReadResult result) {
        return new NotificationReadResponse(result.id(), result.readAt());
    }
}

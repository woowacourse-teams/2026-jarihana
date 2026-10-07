package com.project.jarihana.notification.command.service.dto;

import java.time.LocalDateTime;

public record NotificationReadAllResult(int updatedCount, LocalDateTime readAt) {
}

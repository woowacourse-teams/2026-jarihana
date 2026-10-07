package com.project.jarihana.notification.command.service.dto;

import java.time.LocalDateTime;

public record NotificationReadResult(long id, LocalDateTime readAt) {
}

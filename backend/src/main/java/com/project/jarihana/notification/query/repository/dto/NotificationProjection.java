package com.project.jarihana.notification.query.repository.dto;

import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;

import java.time.LocalDateTime;

public record NotificationProjection(
        long id,
        NotificationEventType eventType,
        int payloadVersion,
        NotificationPayload payload,
        LocalDateTime readAt,
        LocalDateTime createdAt
) {
}

package com.project.jarihana.notification.query.service.dto;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
public record PushContentResult(long notificationId, NotificationEventType eventType, int payloadVersion, NotificationPayload payload) { }

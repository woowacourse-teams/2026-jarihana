package com.project.jarihana.notification.query.controller.dto;

import com.project.jarihana.notification.query.service.dto.NotificationItemResult;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.LocalDateTime;

public record NotificationItemResponse(long id, String eventType, int payloadVersion, String title, String body,
                                       LocalDateTime createdAt, LocalDateTime readAt, TargetResponse target) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record TargetResponse(String kind, long groupId, Long recruitmentId, Long registrationId) { }

    public static NotificationItemResponse from(NotificationItemResult result) {
        return new NotificationItemResponse(result.id(), result.eventType().name(), result.payloadVersion(),
                result.title(), result.body(), result.createdAt(), result.readAt(),
                new TargetResponse(result.target().kind().name(), result.target().groupId(), result.target().recruitmentId(), result.target().registrationId()));
    }
}

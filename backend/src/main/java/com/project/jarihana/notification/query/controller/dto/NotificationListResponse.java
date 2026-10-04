package com.project.jarihana.notification.query.controller.dto;

import com.project.jarihana.notification.query.service.dto.NotificationListResult;

import java.util.List;

public record NotificationListResponse(List<NotificationItemResponse> items, String nextCursor, boolean hasNext) {
    public NotificationListResponse {
        items = List.copyOf(items);
    }

    public static NotificationListResponse from(NotificationListResult result) {
        return new NotificationListResponse(result.items().stream().map(NotificationItemResponse::from).toList(),
                result.nextCursor(), result.hasNext());
    }
}

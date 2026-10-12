package com.project.jarihana.notification.query.controller.dto;

import com.project.jarihana.notification.query.service.dto.NotificationListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record NotificationListRequest(String cursor, @Min(1) @Max(100) Integer size) {
    public NotificationListRequest {
        size = size == null ? 20 : size;
    }

    public NotificationListQuery toQuery() {
        return new NotificationListQuery(cursor, size);
    }
}

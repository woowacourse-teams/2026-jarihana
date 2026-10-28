package com.project.jarihana.notification.query.controller.dto;

import com.project.jarihana.notification.query.service.dto.NotificationListQuery;
import com.project.jarihana.notification.query.service.dto.NotificationClientVersion;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record NotificationListRequest(String cursor, @Min(1) @Max(100) Integer size,
                                      @Min(1) @Max(2) Integer clientVersion) {
    public NotificationListRequest {
        size = size == null ? 20 : size;
        clientVersion = clientVersion == null ? 1 : clientVersion;
    }

    public NotificationListQuery toQuery() {
        return new NotificationListQuery(cursor, size, NotificationClientVersion.from(clientVersion));
    }
}

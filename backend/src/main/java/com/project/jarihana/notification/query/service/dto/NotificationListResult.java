package com.project.jarihana.notification.query.service.dto;

import java.util.List;

public record NotificationListResult(List<NotificationItemResult> items, String nextCursor, boolean hasNext) {
    public NotificationListResult {
        items = List.copyOf(items);
    }
}

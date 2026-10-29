package com.project.jarihana.announcement.query.controller.dto;

import com.project.jarihana.announcement.query.service.dto.AnnouncementListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record AnnouncementListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public AnnouncementListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public AnnouncementListQuery toQuery() {
        return new AnnouncementListQuery(cursor, size);
    }
}

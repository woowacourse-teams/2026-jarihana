package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityPostListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ActivityPostListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size,
        Boolean mine
) {

    public ActivityPostListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
        mine = mine != null && mine;
    }

    public ActivityPostListQuery toQuery() {
        return new ActivityPostListQuery(cursor, size, mine);
    }
}

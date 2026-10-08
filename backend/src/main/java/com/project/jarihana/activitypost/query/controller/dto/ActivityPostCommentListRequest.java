package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityPostCommentListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ActivityPostCommentListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public ActivityPostCommentListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public ActivityPostCommentListQuery toQuery() {
        return new ActivityPostCommentListQuery(cursor, size);
    }
}

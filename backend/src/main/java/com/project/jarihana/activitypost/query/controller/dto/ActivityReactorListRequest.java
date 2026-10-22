package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityReactorListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record ActivityReactorListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public ActivityReactorListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 30 : size;
    }

    public ActivityReactorListQuery toQuery() {
        return new ActivityReactorListQuery(cursor, size);
    }
}

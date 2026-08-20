package com.project.jarihana.recruitment.query.controller.dto;

import com.project.jarihana.recruitment.query.service.dto.RecruitmentListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record RecruitmentListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public RecruitmentListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public RecruitmentListQuery toQuery() {
        return new RecruitmentListQuery(cursor, size);
    }
}

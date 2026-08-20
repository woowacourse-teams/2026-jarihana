package com.project.jarihana.groupmember.query.controller.dto;

import com.project.jarihana.groupmember.query.service.dto.GroupMemberListQuery;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record GroupMemberListRequest(
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public GroupMemberListRequest {
        cursor = cursor == null || cursor.isBlank() ? null : cursor;
        size = size == null ? 20 : size;
    }

    public GroupMemberListQuery toQuery() {
        return new GroupMemberListQuery(cursor, size);
    }
}

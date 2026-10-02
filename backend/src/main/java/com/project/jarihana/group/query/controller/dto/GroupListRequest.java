package com.project.jarihana.group.query.controller.dto;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.query.GroupRelation;
import com.project.jarihana.group.query.service.dto.GroupListQuery;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

public record GroupListRequest(
        GroupStatus status,
        GroupRelation relation,
        GroupMemberRole role,
        GroupType type,
        GroupType excludedType,
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate sessionDate,
        Boolean recruiting,
        String keyword,
        String cursor,
        @Min(1) @Max(100) Integer size
) {

    public GroupListRequest {
        status = status == null ? GroupStatus.ACTIVE : status;
        keyword = normalize(keyword);
        cursor = normalize(cursor);
        size = size == null ? 20 : size;
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    public GroupListQuery toQuery() {
        return new GroupListQuery(
                status,
                relation,
                role,
                type,
                excludedType,
                sessionDate,
                recruiting,
                keyword,
                cursor,
                size
        );
    }
}

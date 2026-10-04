package com.project.jarihana.group.query.service.dto;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.query.GroupRelation;
import com.project.jarihana.groupmember.domain.GroupMemberRole;

import java.time.LocalDate;

public record GroupListQuery(
        GroupStatus status,
        GroupRelation relation,
        GroupMemberRole role,
        GroupType type,
        GroupType excludedType,
        LocalDate sessionDate,
        Boolean recruiting,
        String keyword,
        String cursor,
        int size
) {
}

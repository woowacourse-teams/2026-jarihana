package com.project.jarihana.group.query.service.dto;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.query.GroupRelation;
import com.project.jarihana.groupmember.domain.GroupMemberRole;

public record GroupListQuery(
        GroupStatus status,
        GroupRelation relation,
        GroupMemberRole role,
        GroupType type,
        Boolean recruiting,
        String keyword,
        String cursor,
        int size
) {
}

package com.project.jarihana.group.query.repository.dto;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.groupmember.domain.GroupMemberRole;

import java.time.LocalDateTime;

public record GroupListSearchCriteria(
        GroupStatus status,
        GroupType type,
        GroupMemberRole role,
        boolean joinedOnly,
        boolean recruiting,
        String keyword,
        Long currentMemberId,
        LocalDateTime now,
        LocalDateTime cursorCreatedAt,
        Long cursorId
) {
}

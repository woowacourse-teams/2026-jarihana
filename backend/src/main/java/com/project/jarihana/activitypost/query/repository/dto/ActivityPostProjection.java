package com.project.jarihana.activitypost.query.repository.dto;

import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record ActivityPostProjection(
        Long id,
        Long groupId,
        String groupName,
        GroupType groupType,
        GroupStatus groupStatus,
        boolean groupRecruiting,
        boolean joined,
        String authorNickname,
        String imageKey,
        String caption,
        LocalDate activityDate,
        LocalDateTime createdAt,
        boolean canModify,
        Long commentCount
) {
}

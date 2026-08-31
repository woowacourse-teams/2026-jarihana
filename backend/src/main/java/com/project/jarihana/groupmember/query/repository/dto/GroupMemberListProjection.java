package com.project.jarihana.groupmember.query.repository.dto;

import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Course;

import java.time.LocalDateTime;

public record GroupMemberListProjection(
        Long groupMemberId,
        Long memberId,
        String crewName,
        Integer generation,
        String githubId,
        Course course,
        GroupMemberRole role,
        LocalDateTime joinedAt
) {
}

package com.project.jarihana.groupmember.query.repository.dto;

import com.project.jarihana.groupmember.domain.GroupMemberRole;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;

import java.time.LocalDateTime;

public record GroupMemberListProjection(
        Long groupMemberId,
        Long memberId,
        String crewName,
        Integer generation,
        String githubId,
        MemberType memberType,
        Course course,
        GroupMemberRole role,
        LocalDateTime joinedAt
) {

    public GroupMemberListProjection(
            Long groupMemberId,
            Long memberId,
            String crewName,
            Integer generation,
            String githubId,
            Course course,
            GroupMemberRole role,
            LocalDateTime joinedAt
    ) {
        this(groupMemberId, memberId, crewName, generation, githubId, MemberType.CREW, course, role, joinedAt);
    }
}

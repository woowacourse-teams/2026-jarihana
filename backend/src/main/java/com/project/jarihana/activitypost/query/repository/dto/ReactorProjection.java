package com.project.jarihana.activitypost.query.repository.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;
import java.time.LocalDateTime;

public record ReactorProjection(
        Long reactionId,
        LocalDateTime reactedAt,
        Long memberId,
        String crewName,
        String githubId,
        MemberType memberType,
        Integer generation,
        Course course
) {
}

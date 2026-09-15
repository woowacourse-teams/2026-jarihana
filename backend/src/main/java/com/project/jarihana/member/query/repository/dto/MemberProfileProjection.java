package com.project.jarihana.member.query.repository.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;

public record MemberProfileProjection(
        Long id,
        String crewName,
        Integer generation,
        MemberType memberType,
        Course course,
        String githubId
) {
}

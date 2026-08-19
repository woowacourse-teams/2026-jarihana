package com.project.jarihana.member.query.repository.dto;

import com.project.jarihana.member.domain.Course;

public record MemberProfileProjection(
        Long id,
        String crewName,
        int generation,
        Course course,
        String githubId
) {
}

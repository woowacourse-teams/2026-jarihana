package com.project.jarihana.member.query.service.dto;

import com.project.jarihana.member.domain.Course;

public record MemberProfileResult(
        Long id,
        String crewName,
        int generation,
        Course course,
        String githubId
) {
}

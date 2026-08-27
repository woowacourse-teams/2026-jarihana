package com.project.jarihana.member.command.service.dto;

import com.project.jarihana.auth.command.service.dto.IssuedRefreshToken;
import com.project.jarihana.common.auth.IssuedAccessToken;
import com.project.jarihana.member.domain.Course;

import java.time.LocalDateTime;

public record MemberSignupResult(
        Long id,
        String crewName,
        int generation,
        Course course,
        LocalDateTime joinedAt,
        IssuedAccessToken accessToken,
        IssuedRefreshToken refreshToken
) {
}

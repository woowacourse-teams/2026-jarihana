package com.project.jarihana.member.command.service.dto;

import com.project.jarihana.auth.token.IssuedAccessToken;
import com.project.jarihana.auth.token.IssuedRefreshToken;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;

import java.time.LocalDateTime;

public record MemberSignupResult(
        Long id,
        String crewName,
        Integer generation,
        MemberType memberType,
        Course course,
        LocalDateTime joinedAt,
        IssuedAccessToken accessToken,
        IssuedRefreshToken refreshToken
) {
}

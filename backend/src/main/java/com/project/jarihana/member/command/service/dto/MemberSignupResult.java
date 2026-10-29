package com.project.jarihana.member.command.service.dto;

import com.project.jarihana.auth.token.IssuedAccessToken;
import com.project.jarihana.auth.token.IssuedRefreshToken;
import com.project.jarihana.member.domain.Bootcamp;
import com.project.jarihana.member.domain.Career;
import com.project.jarihana.member.domain.Company;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberField;
import com.project.jarihana.member.domain.MemberType;

import java.time.LocalDateTime;

public record MemberSignupResult(
        Long id,
        String crewName,
        Integer generation,
        MemberType memberType,
        Course course,
        Bootcamp bootcamp,
        MemberField field,
        Career career,
        Company company,
        LocalDateTime joinedAt,
        IssuedAccessToken accessToken,
        IssuedRefreshToken refreshToken
) {
}

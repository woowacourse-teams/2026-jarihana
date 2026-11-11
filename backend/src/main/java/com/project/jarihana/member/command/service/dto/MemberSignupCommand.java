package com.project.jarihana.member.command.service.dto;

import com.project.jarihana.member.domain.MemberType;

public record MemberSignupCommand(
        String githubId,
        String crewName,
        MemberType memberType
) {
}

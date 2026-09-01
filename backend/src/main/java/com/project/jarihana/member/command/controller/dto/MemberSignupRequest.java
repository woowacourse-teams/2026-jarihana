package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.MemberType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record MemberSignupRequest(
        @NotNull MemberType memberType,
        @NotBlank String crewName,
        @Positive Integer generation,
        Course course
) {
}

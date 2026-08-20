package com.project.jarihana.member.command.controller.dto;

import com.project.jarihana.member.domain.Course;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record MemberSignupRequest(
        @NotBlank String crewName,
        @Positive int generation,
        @NotNull Course course
) {
}

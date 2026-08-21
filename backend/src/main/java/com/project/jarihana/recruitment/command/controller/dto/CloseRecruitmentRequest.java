package com.project.jarihana.recruitment.command.controller.dto;

import jakarta.validation.constraints.NotNull;

public record CloseRecruitmentRequest(
        @NotNull RecruitingStatus recruitingStatus
) {

    public enum RecruitingStatus {
        CLOSED
    }
}

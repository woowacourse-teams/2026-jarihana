package com.project.jarihana.recruitment.command.controller.dto;

import com.project.jarihana.recruitment.command.service.dto.CreateRecruitmentCommand;
import com.project.jarihana.recruitment.domain.JoinMethod;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDateTime;

public record CreateRecruitmentRequest(
        @NotNull JoinMethod joinMethod,
        @Positive int capacity,
        @NotNull LocalDateTime startsAt,
        LocalDateTime endsAt
) {

    public CreateRecruitmentCommand toCommand() {
        return new CreateRecruitmentCommand(joinMethod, capacity, startsAt, endsAt);
    }
}

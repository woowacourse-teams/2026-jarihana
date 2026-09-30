package com.project.jarihana.recruitment.command.controller.dto;

import com.project.jarihana.recruitment.command.service.dto.UpdateRecruitmentCommand;
import com.project.jarihana.recruitment.domain.JoinMethod;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDateTime;

public record UpdateRecruitmentRequest(
        @NotNull JoinMethod joinMethod,
        @Positive int capacity,
        @NotNull LocalDateTime startsAt,
        LocalDateTime endsAt
) {

    public UpdateRecruitmentCommand toCommand() {
        return new UpdateRecruitmentCommand(joinMethod, capacity, startsAt, endsAt);
    }
}

package com.project.jarihana.registration.command.controller.dto;

import com.project.jarihana.registration.command.service.dto.DecideRegistrationCommand;
import com.project.jarihana.registration.command.service.dto.RegistrationDecision;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record DecideRegistrationRequest(
        @NotNull RegistrationDecision status,
        @Size(max = 1_000) String decisionReason
) {

    public DecideRegistrationCommand toCommand() {
        return new DecideRegistrationCommand(status, decisionReason);
    }
}

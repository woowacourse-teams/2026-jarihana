package com.project.jarihana.registration.command.controller.dto;

import com.project.jarihana.registration.command.service.dto.CreateRegistrationCommand;
import jakarta.validation.constraints.Size;

public record CreateRegistrationRequest(
        @Size(max = 1_000) String message
) {

    public CreateRegistrationCommand toCommand() {
        return new CreateRegistrationCommand(message);
    }
}

package com.project.jarihana.sparring.command.controller.dto;

import com.project.jarihana.sparring.command.service.dto.CreateSparringCommand;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateSparringRequest(
        @NotBlank @Size(max = 80) String title,
        @NotBlank @Size(max = 32) String a,
        @NotBlank @Size(max = 32) String b,
        @Size(max = 240) String description) {
    public CreateSparringCommand toCommand() {
        return new CreateSparringCommand(title, a, b, description);
    }
}

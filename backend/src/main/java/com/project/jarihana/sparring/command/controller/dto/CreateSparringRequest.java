package com.project.jarihana.sparring.command.controller.dto;

import com.project.jarihana.sparring.command.service.dto.CreateSparringCommand;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.time.ZoneId;

public record CreateSparringRequest(
        @NotBlank @Size(max = 80) String title,
        @NotBlank @Size(max = 32) String a,
        @NotBlank @Size(max = 32) String b,
        @Size(max = 240) String description,
        @NotNull OffsetDateTime closesAt,
        @Size(max = 255) String representativeImageKey) {
    public CreateSparringCommand toCommand() {
        return new CreateSparringCommand(
                title,
                a,
                b,
                description,
                closesAt == null
                        ? null
                        : closesAt.atZoneSameInstant(ZoneId.of("Asia/Seoul")).toLocalDateTime(),
                representativeImageKey);
    }
}

package com.project.jarihana.groupspace.command.controller.dto;

import com.project.jarihana.groupspace.command.service.dto.SaveGroupSpaceCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import tools.jackson.databind.JsonNode;

public record SaveGroupSpaceRequest(
        @NotNull JsonNode room,
        @NotNull @Min(0) Long expectedRevision
) {
    public SaveGroupSpaceCommand toCommand() { return new SaveGroupSpaceCommand(room, expectedRevision); }
}

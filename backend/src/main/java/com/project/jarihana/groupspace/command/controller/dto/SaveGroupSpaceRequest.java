package com.project.jarihana.groupspace.command.controller.dto;

import com.project.jarihana.groupspace.command.service.dto.SaveGroupSpaceCommand;
import com.project.jarihana.groupspace.domain.BlueprintRef;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import tools.jackson.databind.JsonNode;

public record SaveGroupSpaceRequest(
        @NotNull JsonNode room,
        @NotNull @Min(0) Long expectedRevision,
        BlueprintRef blueprintRef,
        Boolean replaceLayout
) {
    public SaveGroupSpaceCommand toCommand() { return new SaveGroupSpaceCommand(room, expectedRevision, blueprintRef, Boolean.TRUE.equals(replaceLayout)); }
}

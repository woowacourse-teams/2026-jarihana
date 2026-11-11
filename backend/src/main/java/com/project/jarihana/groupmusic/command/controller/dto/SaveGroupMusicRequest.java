package com.project.jarihana.groupmusic.command.controller.dto;

import com.project.jarihana.groupmusic.command.service.dto.SaveGroupMusicCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import tools.jackson.databind.JsonNode;

public record SaveGroupMusicRequest(
        @NotNull JsonNode music,
        @NotNull @Min(0) Long expectedRevision
) {
    public SaveGroupMusicCommand toCommand() { return new SaveGroupMusicCommand(music, expectedRevision); }
}

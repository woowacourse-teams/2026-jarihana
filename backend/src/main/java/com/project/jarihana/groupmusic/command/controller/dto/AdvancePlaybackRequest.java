package com.project.jarihana.groupmusic.command.controller.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.project.jarihana.groupmusic.command.service.dto.AdvancePlaybackCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

@JsonIgnoreProperties({"playlistIndex", "trackDurationSeconds", "queueLength"})
public record AdvancePlaybackRequest(@NotNull @Min(0) Long expectedRevision, Boolean checkUnavailable) {
    public AdvancePlaybackCommand toCommand() {
        return new AdvancePlaybackCommand(expectedRevision, Boolean.TRUE.equals(checkUnavailable));
    }
}

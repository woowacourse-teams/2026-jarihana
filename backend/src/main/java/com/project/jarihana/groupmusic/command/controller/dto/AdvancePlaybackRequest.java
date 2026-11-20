package com.project.jarihana.groupmusic.command.controller.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.project.jarihana.groupmusic.command.service.dto.AdvancePlaybackCommand;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties({"playlistIndex", "trackDurationSeconds", "queueLength"})
public record AdvancePlaybackRequest(@NotNull @Min(0) Long expectedRevision, Boolean checkUnavailable,
                                     @Size(min = 1, max = 64) String expectedCurrentQueueId) {
    public AdvancePlaybackCommand toCommand() {
        return new AdvancePlaybackCommand(expectedRevision, Boolean.TRUE.equals(checkUnavailable), expectedCurrentQueueId);
    }
}

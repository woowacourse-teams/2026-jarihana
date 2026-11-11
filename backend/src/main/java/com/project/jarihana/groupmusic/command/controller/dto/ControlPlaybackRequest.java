package com.project.jarihana.groupmusic.command.controller.dto;

import com.project.jarihana.groupmusic.command.service.dto.ControlPlaybackCommand;
import com.project.jarihana.groupmusic.domain.PlaybackState;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.DecimalMin;

public record ControlPlaybackRequest(@NotNull @Min(0) Long expectedRevision, @NotNull PlaybackState state,
                                     @NotNull @Min(0) Integer playlistIndex, @NotNull @DecimalMin("0") Double positionSeconds,
                                     @Size(min = 1, max = 64) String expectedCurrentQueueId) {
    public ControlPlaybackCommand toCommand() {
        return new ControlPlaybackCommand(expectedRevision, state, playlistIndex, positionSeconds, expectedCurrentQueueId);
    }
}

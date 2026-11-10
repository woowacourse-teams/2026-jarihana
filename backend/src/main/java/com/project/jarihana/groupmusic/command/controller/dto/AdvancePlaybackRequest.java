package com.project.jarihana.groupmusic.command.controller.dto;

import com.project.jarihana.groupmusic.command.service.dto.AdvancePlaybackCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;

public record AdvancePlaybackRequest(@NotNull @Min(0) Long expectedRevision, @NotNull @Min(0) Integer playlistIndex,
                                     @NotNull @DecimalMin(value = "0", inclusive = false) @DecimalMax("86400") Double trackDurationSeconds,
                                     @NotNull @Min(1) @Max(5000) Integer queueLength) {
    public AdvancePlaybackCommand toCommand() {
        return new AdvancePlaybackCommand(expectedRevision, playlistIndex, trackDurationSeconds, queueLength);
    }
}

package com.project.jarihana.groupmusic.command.controller.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SkipMusicQueueRequest(@NotNull @Min(0) Long expectedRevision,
                                   @Size(min = 1, max = 64) String expectedCurrentQueueId) {}

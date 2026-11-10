package com.project.jarihana.groupmusic.command.controller.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SkipMusicQueueRequest(@NotNull @Min(0) Long expectedRevision) {}

package com.project.jarihana.rhythm.command.controller.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;

import jakarta.validation.constraints.NotNull;

public record RhythmChallengeCreateRequest(@NotNull RhythmLevel level, @NotNull Double scrollSpeed) {
}

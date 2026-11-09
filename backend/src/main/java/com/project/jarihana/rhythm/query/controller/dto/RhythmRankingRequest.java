package com.project.jarihana.rhythm.query.controller.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RhythmRankingRequest(@NotNull RhythmLevel level, @Size(max = 256) String cursor,
        @Min(1) @Max(100) Integer size) {
    public RhythmRankingRequest {
        if (size == null) {
            size = 20;
        }
    }
}

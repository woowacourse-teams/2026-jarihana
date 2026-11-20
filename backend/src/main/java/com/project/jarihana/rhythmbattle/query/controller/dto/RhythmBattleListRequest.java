package com.project.jarihana.rhythmbattle.query.controller.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record RhythmBattleListRequest(@Size(max = 256) String cursor, @Min(1) @Max(100) Integer size) {
    public RhythmBattleListRequest {
        if (size == null) {
            size = 20;
        }
    }
}

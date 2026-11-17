package com.project.jarihana.rhythmbattle.query.controller.dto;

import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleSummaryResult;

public record RhythmBattleSummaryResponse(long total, long wins, long losses, long draws) {
    public static RhythmBattleSummaryResponse from(RhythmBattleSummaryResult result) {
        return new RhythmBattleSummaryResponse(result.total(), result.wins(), result.losses(), result.draws());
    }
}

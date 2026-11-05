package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.gomoku.query.service.dto.GomokuStatisticsResult;
import java.math.BigDecimal;

public record GomokuStatisticsResponse(long total, long wins, long losses, long draws, BigDecimal winRate) {
    public static GomokuStatisticsResponse from(GomokuStatisticsResult result) {
        return new GomokuStatisticsResponse(result.total(), result.wins(), result.losses(), result.draws(), result.winRate());
    }
}

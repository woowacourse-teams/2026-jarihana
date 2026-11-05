package com.project.jarihana.gomoku.query.service.dto;

import com.project.jarihana.gomoku.query.repository.GomokuGameQueryRepository.Statistics;
import java.math.BigDecimal;
import java.math.RoundingMode;

public record GomokuStatisticsResult(long total, long wins, long losses, long draws, BigDecimal winRate) {
    public static GomokuStatisticsResult from(Statistics row) {
        BigDecimal rate = row.getTotal() == 0 ? null : BigDecimal.valueOf(row.getWins())
                .multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(row.getTotal()), 1, RoundingMode.HALF_UP);
        return new GomokuStatisticsResult(row.getTotal(), row.getWins(), row.getTotal()-row.getWins()-row.getDraws(), row.getDraws(), rate);
    }
}

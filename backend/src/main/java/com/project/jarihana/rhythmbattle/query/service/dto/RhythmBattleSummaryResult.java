package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythmbattle.query.repository.RhythmBattleRankingQueryRepository;

public record RhythmBattleSummaryResult(long total, long wins, long losses, long draws) {
    public static RhythmBattleSummaryResult from(RhythmBattleRankingQueryRepository.Statistics statistics) {
        return new RhythmBattleSummaryResult(statistics.getTotal(), statistics.getWins(),
                statistics.getTotal() - statistics.getWins() - statistics.getDraws(), statistics.getDraws());
    }
}

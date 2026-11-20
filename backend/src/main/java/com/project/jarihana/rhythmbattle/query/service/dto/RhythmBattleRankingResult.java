package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythmbattle.query.repository.RhythmBattleRankingQueryRepository;

import java.util.List;

public record RhythmBattleRankingResult(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    public RhythmBattleRankingResult {
        items = List.copyOf(items);
    }

    public record Item(long rank, long memberId, String name, String githubId, long wins, long losses, long draws,
            long total) {
        public static Item from(RhythmBattleRankingQueryRepository.Ranking row) {
            return new Item(row.getRank(), row.getMemberId(), row.getName(), row.getGithubId(), row.getWins(),
                    row.getLosses(), row.getDraws(), row.getTotal());
        }
    }
}

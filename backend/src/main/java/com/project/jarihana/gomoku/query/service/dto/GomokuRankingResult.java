package com.project.jarihana.gomoku.query.service.dto;

import com.project.jarihana.gomoku.query.repository.GomokuGameQueryRepository.Ranking;
import java.util.List;

public record GomokuRankingResult(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    public GomokuRankingResult { items = List.copyOf(items); }

    public record Item(long memberId, long rank, String name, String githubId, GomokuStatisticsResult statistics) {
        public static Item from(Ranking row) {
            return new Item(row.getMemberId(), row.getRank(), row.getName(), row.getGithubId(), GomokuStatisticsResult.from(row));
        }
    }
}

package com.project.jarihana.gomoku.query.service.dto;

import com.project.jarihana.gomoku.query.repository.GomokuGameQueryRepository.History;
import java.time.LocalDateTime;
import java.util.List;

public record GomokuHistoryResult(List<Item> items, String nextCursor, boolean hasNext) {
    public GomokuHistoryResult { items = List.copyOf(items); }

    public record Item(long id, String opponentName, String opponentGithubId, String result,
            String rule, String endReason, LocalDateTime endedAt) {
        public static Item from(History row) {
            return new Item(row.getId(), row.getOpponentName(), row.getOpponentGithubId(), row.getResult(),
                    row.getRule(), row.getEndReason(), row.getEndedAt());
        }
    }
}

package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.gomoku.query.service.dto.GomokuHistoryResult;
import java.time.LocalDateTime;
import java.util.List;

public record GomokuHistoryResponse(List<Item> items, String nextCursor, boolean hasNext) {
    public static GomokuHistoryResponse from(GomokuHistoryResult result) {
        return new GomokuHistoryResponse(result.items().stream().map(Item::from).toList(), result.nextCursor(), result.hasNext());
    }

    public record Item(long id, String opponentName, String opponentAvatarUrl, String result,
            String rule, String endReason, LocalDateTime endedAt) {
        public static Item from(GomokuHistoryResult.Item item) {
            return new Item(item.id(), item.opponentName(), GithubAvatarUrl.from(item.opponentGithubId()),
                    item.result(), item.rule(), item.endReason(), item.endedAt());
        }
    }
}

package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.gomoku.query.service.dto.GomokuRankingResult;
import java.math.BigDecimal;
import java.util.List;

public record GomokuRankingResponse(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    public static GomokuRankingResponse from(GomokuRankingResult result) {
        return new GomokuRankingResponse(result.items().stream().map(Item::from).toList(),
                result.me() == null ? null : Item.from(result.me()), result.nextCursor(), result.hasNext());
    }

    public record Item(long memberId, long rank, String name, String avatarUrl,
            long total, long wins, long losses, long draws, BigDecimal winRate) {
        public static Item from(GomokuRankingResult.Item item) {
            var stats = item.statistics();
            return new Item(item.memberId(), item.rank(), item.name(), GithubAvatarUrl.from(item.githubId()),
                    stats.total(), stats.wins(), stats.losses(), stats.draws(), stats.winRate());
        }
    }
}

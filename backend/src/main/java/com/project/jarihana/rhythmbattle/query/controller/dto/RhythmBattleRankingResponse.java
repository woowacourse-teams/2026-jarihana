package com.project.jarihana.rhythmbattle.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRankingResult;

import java.util.List;

public record RhythmBattleRankingResponse(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    public static RhythmBattleRankingResponse from(RhythmBattleRankingResult result) {
        return new RhythmBattleRankingResponse(result.items().stream().map(Item::from).toList(),
                result.me() == null ? null : Item.from(result.me()), result.nextCursor(), result.hasNext());
    }

    public record Item(long rank, long memberId, String name, String avatarUrl, long wins, long losses, long draws,
            long total) {
        static Item from(RhythmBattleRankingResult.Item item) {
            return new Item(item.rank(), item.memberId(), item.name(), GithubAvatarUrl.from(item.githubId()), item.wins(), item.losses(),
                    item.draws(), item.total());
        }
    }
}

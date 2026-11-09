package com.project.jarihana.rhythm.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.rhythm.query.service.dto.RhythmRankingResult;

import java.time.LocalDateTime;
import java.util.List;

public record RhythmRankingResponse(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    public static RhythmRankingResponse from(RhythmRankingResult result) {
        return new RhythmRankingResponse(result.items().stream().map(Item::from).toList(),
                result.me() == null ? null : Item.from(result.me()), result.nextCursor(), result.hasNext());
    }

    public record Item(long memberId, long challengeId, long rank, String name, String avatarUrl, long score,
            int bestCombo, int loopReached, LocalDateTime achievedAt) {
        public static Item from(RhythmRankingResult.Item item) {
            return new Item(item.memberId(), item.challengeId(), item.rank(), item.name(),
                    GithubAvatarUrl.from(item.githubId()), item.score(), item.bestCombo(), item.loopReached(),
                    item.achievedAt());
        }
    }
}

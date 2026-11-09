package com.project.jarihana.minigame.query.controller.dto;

import com.project.jarihana.minigame.query.service.dto.RankingResult;
import java.util.List;

public record RankingResponse(List<Item> items, Item me) {

    public static RankingResponse from(RankingResult result) {
        return new RankingResponse(
                result.items().stream().map(Item::from).toList(),
                result.me() == null ? null : Item.from(result.me())
        );
    }

    public record Item(long rank, String nickname, int totalScore, long totalDurationMillis) {

        private static Item from(RankingResult.Entry entry) {
            return new Item(entry.rank(), entry.nickname(), entry.totalScore(), entry.totalDurationMillis());
        }
    }
}

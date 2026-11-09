package com.project.jarihana.rhythm.query.service.dto;

import com.project.jarihana.rhythm.query.repository.dto.RhythmRankingProjection;

import java.time.LocalDateTime;
import java.util.List;

public record RhythmRankingResult(List<Item> items, Item me, String nextCursor, boolean hasNext) {
    public RhythmRankingResult {
        items = List.copyOf(items);
    }

    public record Item(long memberId, long challengeId, long rank, String name, String githubId, long score,
            int bestCombo, int loopReached, LocalDateTime achievedAt) {
        public static Item from(RhythmRankingProjection row) {
            return new Item(row.getMemberId(), row.getChallengeId(), row.getRank(), row.getName(), row.getGithubId(),
                    row.getScore(), row.getBestCombo(), row.getLoopReached(), row.getFinishedAt());
        }
    }
}

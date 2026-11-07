package com.project.jarihana.gomoku.analytics;

import com.project.jarihana.gomoku.domain.GomokuGame;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

public record GomokuPostHogEvent(UUID id, long gameId, String name, LocalDateTime occurredAt,
                                 String endReason, Long durationMs, Integer moveCount) {

    public static GomokuPostHogEvent started(GomokuGame game) {
        return new GomokuPostHogEvent(UUID.randomUUID(), game.getId(), "gomoku_game_started",
                game.getCreatedAt(), null, null, null);
    }

    public static GomokuPostHogEvent finished(GomokuGame game) {
        long durationMs = Math.max(0, Duration.between(game.getCreatedAt(), game.getEndedAt()).toMillis());
        return new GomokuPostHogEvent(UUID.randomUUID(), game.getId(), "gomoku_game_finished",
                game.getEndedAt(), game.getEndReason(), durationMs, game.getPly());
    }
}

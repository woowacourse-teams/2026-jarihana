package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.StickPuzzle;
import java.time.LocalDateTime;

/**
 * 게임방 판처럼 횟수 제한이 없으면 남은 횟수와 충전 시각은 null이다.
 */
public record StartRunResult(
        long runId,
        int round,
        StickPuzzle stick,
        Integer remainingAttempts,
        LocalDateTime attemptsRefillAt
) {
}

package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.command.service.dto.StartRunResult;
import com.project.jarihana.minigame.domain.MinigameRun;
import java.time.LocalDateTime;

public record StartRunResponse(
        long runId,
        int round,
        int timeLimitSeconds,
        Integer remainingAttempts,
        LocalDateTime attemptsRefillAt,
        StickResponse stick
) {

    public static StartRunResponse from(StartRunResult result) {
        return new StartRunResponse(
                result.runId(),
                result.round(),
                (int) MinigameRun.ROUND_TIME_LIMIT.toSeconds(),
                result.remainingAttempts(),
                result.attemptsRefillAt(),
                StickResponse.from(result.stick())
        );
    }
}

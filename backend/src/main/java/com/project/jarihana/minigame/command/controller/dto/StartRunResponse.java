package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.command.service.dto.StartRunResult;
import com.project.jarihana.minigame.domain.MinigameRun;

public record StartRunResponse(
        long runId,
        int round,
        int timeLimitSeconds,
        StickResponse stick
) {

    public static StartRunResponse from(StartRunResult result) {
        return new StartRunResponse(
                result.runId(),
                result.round(),
                (int) MinigameRun.ROUND_TIME_LIMIT.toSeconds(),
                StickResponse.from(result.stick())
        );
    }
}

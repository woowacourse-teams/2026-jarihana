package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.command.service.dto.StartRunResult;
import com.project.jarihana.minigame.domain.MinigameRun;

/**
 * 판을 시작하거나 다음 막대를 받았을 때의 응답이다. 화면은 {@code remainingMillis}로 남은 시간을 센다.
 */
public record StartRunResponse(
        long runId,
        int round,
        int timeLimitSeconds,
        long remainingMillis,
        StickResponse stick
) {

    public static StartRunResponse from(StartRunResult result) {
        return new StartRunResponse(
                result.runId(),
                result.round(),
                (int) MinigameRun.ROUND_TIME_LIMIT.toSeconds(),
                result.remainingMillis(),
                StickResponse.from(result.stick())
        );
    }
}

package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.StickPuzzle;

/**
 * 판을 시작하거나 다음 막대를 받았을 때 내려줄 막대다. {@code remainingMillis}는 서버가 정한 제한 시간 마감까지 남은 시간이다.
 */
public record StartRunResult(long runId, int round, StickPuzzle stick, long remainingMillis) {
}

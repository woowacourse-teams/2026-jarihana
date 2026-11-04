package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.MinigameEvent;

/**
 * 자를 판이 어느 순위표의 판인지 함께 받아, 다른 순위표의 판은 없는 판으로 본다.
 */
public record CutCommand(MinigameEvent event, long memberId, long runId, int round, double position) {
}

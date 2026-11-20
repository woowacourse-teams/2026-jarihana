package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.MinigameEvent;

/**
 * 결과를 본 뒤 다음 막대를 받는 요청이다. 판이 어느 순위표의 판인지 함께 받는다.
 */
public record IssueRoundCommand(MinigameEvent event, long memberId, long runId, int round) {
}

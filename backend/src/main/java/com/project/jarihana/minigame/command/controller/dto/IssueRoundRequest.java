package com.project.jarihana.minigame.command.controller.dto;

import com.project.jarihana.minigame.command.service.dto.IssueRoundCommand;
import com.project.jarihana.minigame.domain.MinigameEvent;
import jakarta.validation.constraints.Positive;

public record IssueRoundRequest(
        @Positive(message = "받을 막대 번호를 다시 확인해 주세요.")
        int round
) {

    public IssueRoundCommand toCommand(MinigameEvent event, long memberId, long runId) {
        return new IssueRoundCommand(event, memberId, runId, round);
    }
}

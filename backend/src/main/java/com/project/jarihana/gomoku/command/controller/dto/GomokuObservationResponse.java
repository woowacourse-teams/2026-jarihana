package com.project.jarihana.gomoku.command.controller.dto;

import com.project.jarihana.gomoku.command.service.dto.GomokuObservationResult;
import java.util.UUID;

public record GomokuObservationResponse(UUID participationId, String chatStartSequence) {
    public static GomokuObservationResponse from(GomokuObservationResult result) {
        return new GomokuObservationResponse(result.observation().getParticipationId(),
                Long.toString(result.observation().getChatStartSequence()));
    }
}

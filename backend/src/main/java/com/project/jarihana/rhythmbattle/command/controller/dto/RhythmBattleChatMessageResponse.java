package com.project.jarihana.rhythmbattle.command.controller.dto;

import com.project.jarihana.rhythmbattle.domain.RhythmBattleChatMessage;

import java.time.LocalDateTime;
import java.util.UUID;

public record RhythmBattleChatMessageResponse(
        long id,
        long memberId,
        String senderName,
        String body,
        UUID clientMessageId,
        LocalDateTime createdAt
) {
    public static RhythmBattleChatMessageResponse from(RhythmBattleChatMessage message) {
        return new RhythmBattleChatMessageResponse(message.getId(), message.getMemberId(), message.getSenderName(),
                message.getBody(), message.getClientMessageId(), message.getCreatedAt());
    }
}

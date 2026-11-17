package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleChatProjection;

import java.time.LocalDateTime;
import java.util.UUID;

public record RhythmBattleChatResult(long id, long memberId, String senderName, String body, UUID clientMessageId,
        LocalDateTime createdAt) {
    public static RhythmBattleChatResult from(RhythmBattleChatProjection message) {
        return new RhythmBattleChatResult(message.getId(), message.getMemberId(), message.getSenderName(),
                message.getBody(), message.getClientMessageId(), message.getCreatedAt());
    }
}

package com.project.jarihana.rhythmbattle.query.controller.dto;

import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleChatResult;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record RhythmBattleChatHistoryResponse(List<Item> items) {
    public static RhythmBattleChatHistoryResponse from(List<RhythmBattleChatResult> messages) {
        return new RhythmBattleChatHistoryResponse(messages.stream().map(Item::from).toList());
    }

    public record Item(long id, long memberId, String senderName, String body, UUID clientMessageId,
            LocalDateTime createdAt) {
        public static Item from(RhythmBattleChatResult message) {
            return new Item(message.id(), message.memberId(), message.senderName(), message.body(),
                    message.clientMessageId(), message.createdAt());
        }
    }
}

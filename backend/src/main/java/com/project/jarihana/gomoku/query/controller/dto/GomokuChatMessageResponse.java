package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.gomoku.query.service.dto.GomokuChatMessageResult;
import java.time.LocalDateTime;
import java.util.UUID;
import com.project.jarihana.gomoku.domain.GomokuSenderRole;

public record GomokuChatMessageResponse(String id, String sequence, String senderId, UUID clientMessageId,
        String author, String content, LocalDateTime createdAt, GomokuSenderRole senderRole) {
    public static GomokuChatMessageResponse from(GomokuChatMessageResult row) {
        return new GomokuChatMessageResponse(Long.toString(row.id()), Long.toString(row.sequence()),
                Long.toString(row.senderId()), row.clientMessageId(), row.author(), row.content(), row.createdAt(), row.senderRole());
    }

}

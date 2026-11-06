package com.project.jarihana.gomoku.query.service.dto;

import com.project.jarihana.gomoku.domain.GomokuChatMessage;
import com.project.jarihana.gomoku.query.repository.dto.GomokuChatMessageProjection;
import java.time.LocalDateTime;
import java.util.UUID;

public record GomokuChatMessageResult(long id, long sequence, long senderId, UUID clientMessageId,
        String author, String content, LocalDateTime createdAt) {
    public static GomokuChatMessageResult from(GomokuChatMessageProjection row) {
        return new GomokuChatMessageResult(row.getId(), row.getSequence(), row.getSenderId(),
                row.getClientMessageId(), row.getAuthor(), row.getContent(), row.getCreatedAt());
    }

    public static GomokuChatMessageResult from(GomokuChatMessage message) {
        return new GomokuChatMessageResult(message.getId(), message.getSequence(), message.getSenderId(),
                message.getClientMessageId(), message.getAuthor(), message.getContent(), message.getCreatedAt());
    }
}

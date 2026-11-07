package com.project.jarihana.gomoku.command.controller.dto;

import com.project.jarihana.gomoku.domain.GomokuChatMessage;
import com.project.jarihana.gomoku.domain.GomokuSenderRole;
import java.time.LocalDateTime;
import java.util.UUID;

public record SendGomokuChatResponse(String id, String sequence, String senderId, UUID clientMessageId,
        String author, String content, LocalDateTime createdAt, GomokuSenderRole senderRole) {
    public static SendGomokuChatResponse from(GomokuChatMessage message) {
        return new SendGomokuChatResponse(Long.toString(message.getId()), Long.toString(message.getSequence()),
                Long.toString(message.getSenderId()), message.getClientMessageId(), message.getAuthor(), message.getContent(), message.getCreatedAt(), message.getSenderRole());
    }
}

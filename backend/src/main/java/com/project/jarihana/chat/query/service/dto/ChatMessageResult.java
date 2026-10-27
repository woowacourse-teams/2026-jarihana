package com.project.jarihana.chat.query.service.dto;

import com.project.jarihana.chat.query.repository.dto.ChatMessageProjection;

import java.time.LocalDateTime;
import java.util.UUID;

public record ChatMessageResult(
        long id,
        long groupId,
        long sequence,
        long senderId,
        String author,
        String githubId,
        UUID clientMessageId,
        String content,
        LocalDateTime createdAt) {
    public static ChatMessageResult from(ChatMessageProjection message) {
        if (message == null) return null;
        return new ChatMessageResult(
                message.id(),
                message.groupId(),
                message.sequence(),
                message.senderId(),
                message.author(),
                message.githubId(),
                message.clientMessageId(),
                message.content(),
                message.createdAt());
    }
}

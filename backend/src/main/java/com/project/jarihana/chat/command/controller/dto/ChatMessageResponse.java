package com.project.jarihana.chat.command.controller.dto;

import com.project.jarihana.chat.domain.ChatMessage;

import java.time.LocalDateTime;

public record ChatMessageResponse(
        String id,
        String groupId,
        String sequence,
        String senderId,
        String author,
        String clientMessageId,
        String content,
        LocalDateTime createdAt) {
    public static ChatMessageResponse from(ChatMessage m) {
        return m == null
                ? null
                : new ChatMessageResponse(
                        Long.toString(m.id()),
                        Long.toString(m.groupId()),
                        Long.toString(m.sequence()),
                        Long.toString(m.senderId()),
                        m.author(),
                        m.clientMessageId().toString(),
                        m.content(),
                        m.createdAt());
    }
}

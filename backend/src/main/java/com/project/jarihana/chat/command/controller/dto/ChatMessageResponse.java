package com.project.jarihana.chat.command.controller.dto;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.chat.query.service.dto.ChatMessageResult;
import com.project.jarihana.common.github.GithubAvatarUrl;

import java.time.LocalDateTime;

public record ChatMessageResponse(
        String id,
        String groupId,
        String sequence,
        String senderId,
        String author,
        String avatarUrl,
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
                        GithubAvatarUrl.from(m.githubId()),
                        m.clientMessageId().toString(),
                        m.content(),
                        m.createdAt());
    }

    public static ChatMessageResponse from(ChatMessageResult message) {
        return message == null
                ? null
                : new ChatMessageResponse(
                        Long.toString(message.id()),
                        Long.toString(message.groupId()),
                        Long.toString(message.sequence()),
                        Long.toString(message.senderId()),
                        message.author(),
                        GithubAvatarUrl.from(message.githubId()),
                        message.clientMessageId().toString(),
                        message.content(),
                        message.createdAt());
    }
}

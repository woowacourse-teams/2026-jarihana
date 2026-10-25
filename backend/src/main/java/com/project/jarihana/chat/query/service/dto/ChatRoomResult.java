package com.project.jarihana.chat.query.service.dto;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.chat.query.repository.dto.ChatRoomProjection;

import java.time.LocalDateTime;

public record ChatRoomResult(
        long groupId,
        String name,
        String type,
        String description,
        String representativeImageUrl,
        long memberCount,
        String status,
        long latestSequence,
        long lastReadSequence,
        long unreadCount,
        ChatMessage lastMessage,
        LocalDateTime updatedAt) {
    public static ChatRoomResult from(ChatRoomProjection p, String representativeImageUrl) {
        return new ChatRoomResult(
                p.groupId(),
                p.name(),
                p.type(),
                p.description(),
                representativeImageUrl,
                p.memberCount(),
                p.status(),
                p.latestSequence(),
                p.lastReadSequence(),
                p.unreadCount(),
                p.lastMessage(),
                p.updatedAt());
    }
}

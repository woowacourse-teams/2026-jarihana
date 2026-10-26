package com.project.jarihana.chat.query.repository.dto;

import java.time.LocalDateTime;

public record ChatRoomProjection(
        long groupId,
        String name,
        String type,
        String description,
        String representativeImageKey,
        long memberCount,
        String status,
        long latestSequence,
        long lastReadSequence,
        long unreadCount,
        ChatMessageProjection lastMessage,
        LocalDateTime updatedAt,
        LocalDateTime createdAt) {}

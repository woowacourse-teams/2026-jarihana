package com.project.jarihana.chat.query.repository.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record ChatMessageProjection(
        long id,
        long groupId,
        long sequence,
        long senderId,
        String author,
        UUID clientMessageId,
        String content,
        LocalDateTime createdAt) {}

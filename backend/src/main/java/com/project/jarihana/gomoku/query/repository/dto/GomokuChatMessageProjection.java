package com.project.jarihana.gomoku.query.repository.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public interface GomokuChatMessageProjection {
    long getId();
    long getSequence();
    long getSenderId();
    UUID getClientMessageId();
    String getAuthor();
    String getContent();
    LocalDateTime getCreatedAt();
}

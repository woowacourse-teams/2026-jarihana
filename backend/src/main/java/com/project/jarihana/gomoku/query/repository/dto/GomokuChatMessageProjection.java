package com.project.jarihana.gomoku.query.repository.dto;

import java.time.LocalDateTime;
import java.util.UUID;
import com.project.jarihana.gomoku.domain.GomokuSenderRole;

public interface GomokuChatMessageProjection {
    long getId();
    long getSequence();
    long getSenderId();
    UUID getClientMessageId();
    String getAuthor();
    GomokuSenderRole getSenderRole();
    String getContent();
    LocalDateTime getCreatedAt();
}

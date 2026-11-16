package com.project.jarihana.rhythmbattle.query.repository.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public interface RhythmBattleChatProjection {
    long getId();

    long getRoomId();

    long getMemberId();

    String getSenderName();

    String getBody();

    UUID getClientMessageId();

    LocalDateTime getCreatedAt();
}

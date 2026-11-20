package com.project.jarihana.gomoku.query.repository.dto;

import com.project.jarihana.gomoku.domain.RoomStatus;
import java.time.LocalDateTime;
import java.util.UUID;

public interface GomokuChatAccessProjection {
    UUID getParticipationId();
    long getChatStartSequence();
    long getLatestSequence();
    RoomStatus getStatus();
    LocalDateTime getTouchedAt();
}

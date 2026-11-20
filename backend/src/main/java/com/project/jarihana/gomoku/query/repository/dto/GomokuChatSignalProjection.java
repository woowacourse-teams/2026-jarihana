package com.project.jarihana.gomoku.query.repository.dto;

import java.util.UUID;

public interface GomokuChatSignalProjection {
    long getMemberId();
    UUID getParticipationId();
    long getLatestSequence();
}

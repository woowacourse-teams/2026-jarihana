package com.project.jarihana.gomoku.stream;

import com.project.jarihana.gomoku.query.service.dto.GomokuChatSignalResult;
import java.util.UUID;

public record GomokuChatChanged(UUID participationId, String latestSequence) {
    public static GomokuChatChanged from(GomokuChatSignalResult signal) {
        return new GomokuChatChanged(signal.participationId(), Long.toString(signal.latestSequence()));
    }
}

package com.project.jarihana.gomoku.query.service.dto;

import java.util.List;
import java.util.UUID;

public record GomokuChatHistoryResult(UUID participationId, long latestSequence,
        List<GomokuChatMessageResult> items, Long nextCursor, boolean hasNext) {
    public GomokuChatHistoryResult {
        items = List.copyOf(items);
    }
}

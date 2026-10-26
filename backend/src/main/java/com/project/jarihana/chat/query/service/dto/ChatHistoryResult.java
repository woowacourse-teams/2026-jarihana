package com.project.jarihana.chat.query.service.dto;

import java.util.List;

public record ChatHistoryResult(
        List<ChatMessageResult> items,
        String nextCursor,
        boolean hasNext,
        long latestSequence,
        long lastReadSequence,
        String status) {
    public ChatHistoryResult {
        items = List.copyOf(items);
    }
}

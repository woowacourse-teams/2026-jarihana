package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.gomoku.query.service.dto.GomokuChatHistoryResult;
import java.util.List;
import java.util.UUID;

public record GomokuChatHistoryResponse(UUID participationId, String latestSequence,
        List<GomokuChatMessageResponse> items, String nextCursor, boolean hasNext) {
    public static GomokuChatHistoryResponse from(GomokuChatHistoryResult result) {
        return new GomokuChatHistoryResponse(result.participationId(), Long.toString(result.latestSequence()),
                result.items().stream().map(GomokuChatMessageResponse::from).toList(),
                result.nextCursor() == null ? null : Long.toString(result.nextCursor()), result.hasNext());
    }
}

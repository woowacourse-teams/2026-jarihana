package com.project.jarihana.chat.query.controller.dto;

import com.project.jarihana.chat.command.controller.dto.ChatMessageResponse;
import com.project.jarihana.chat.query.service.dto.ChatHistoryResult;

import java.util.List;

public record ChatHistoryResponse(
        List<ChatMessageResponse> items,
        String nextCursor,
        boolean hasNext,
        String latestSequence,
        String lastReadSequence,
        String status) {
    public static ChatHistoryResponse from(ChatHistoryResult r) {
        return new ChatHistoryResponse(
                r.items().stream().map(ChatMessageResponse::from).toList(),
                r.nextCursor(),
                r.hasNext(),
                Long.toString(r.latestSequence()),
                Long.toString(r.lastReadSequence()),
                r.status());
    }
}

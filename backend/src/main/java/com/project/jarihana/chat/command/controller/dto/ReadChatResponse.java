package com.project.jarihana.chat.command.controller.dto;

import com.project.jarihana.chat.command.service.dto.ReadChatResult;

public record ReadChatResponse(
        String groupId, String lastReadSequence, String latestSequence, long unreadCount) {
    public static ReadChatResponse from(ReadChatResult r) {
        return new ReadChatResponse(
                Long.toString(r.groupId()),
                Long.toString(r.lastReadSequence()),
                Long.toString(r.latestSequence()),
                r.unreadCount());
    }
}

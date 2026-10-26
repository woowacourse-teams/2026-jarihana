package com.project.jarihana.chat.query.service.dto;

import java.util.List;

public record ChatRoomsResult(List<ChatRoomResult> items, String nextCursor, boolean hasNext) {
    public ChatRoomsResult {
        items = List.copyOf(items);
    }
}

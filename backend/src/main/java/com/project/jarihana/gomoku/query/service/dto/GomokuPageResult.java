package com.project.jarihana.gomoku.query.service.dto;

import java.util.List;

public record GomokuPageResult(List<GomokuRoomResult> items, String nextCursor, boolean hasNext) {
    public GomokuPageResult {
        items = List.copyOf(items);
    }
}

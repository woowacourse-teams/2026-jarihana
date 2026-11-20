package com.project.jarihana.gomoku.query.service.dto;

import java.util.List;
import java.util.Map;

public record GomokuPageResult(List<GomokuRoomResult> items, String nextCursor, boolean hasNext,
        Map<Long, Long> spectatorCounts) {
    public GomokuPageResult {
        items = List.copyOf(items);
        spectatorCounts = Map.copyOf(spectatorCounts);
    }
}

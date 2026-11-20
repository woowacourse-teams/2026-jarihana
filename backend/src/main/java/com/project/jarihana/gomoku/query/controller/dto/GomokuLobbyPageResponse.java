package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.gomoku.query.service.dto.GomokuPageResult;

import java.util.List;

public record GomokuLobbyPageResponse(
        List<GomokuLobbyRoomResponse> items, String nextCursor, boolean hasNext) {
    public static GomokuLobbyPageResponse from(GomokuPageResult result) {
        return new GomokuLobbyPageResponse(
                result.items().stream().map(room -> GomokuLobbyRoomResponse.from(room,
                        result.spectatorCounts().getOrDefault(room.id(), 0L))).toList(),
                result.nextCursor(),
                result.hasNext());
    }
}

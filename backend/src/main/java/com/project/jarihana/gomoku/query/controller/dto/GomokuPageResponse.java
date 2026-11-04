package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.gomoku.query.service.dto.GomokuPageResult;

import java.util.List;

public record GomokuPageResponse(
        List<GomokuLobbyRoomResponse> items, String nextCursor, boolean hasNext) {
    public static GomokuPageResponse from(GomokuPageResult result) {
        return new GomokuPageResponse(
                result.items().stream().map(GomokuLobbyRoomResponse::from).toList(),
                result.nextCursor(),
                result.hasNext());
    }
}

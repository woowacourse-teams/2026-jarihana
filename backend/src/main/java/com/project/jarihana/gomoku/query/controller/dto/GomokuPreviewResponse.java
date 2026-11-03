package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

public record GomokuPreviewResponse(
        long id,
        String hostName,
        String guestName,
        GomokuRule rule,
        RoomVisibility visibility,
        RoomStatus status) {
    public static GomokuPreviewResponse from(GomokuRoomResult room) {
        return new GomokuPreviewResponse(
                room.id(),
                room.hostName(),
                room.guestName(),
                room.rule(),
                room.visibility(),
                room.status());
    }
}

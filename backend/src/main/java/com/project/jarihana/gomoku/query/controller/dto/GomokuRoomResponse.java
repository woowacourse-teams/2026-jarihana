package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

public record GomokuRoomResponse(
        long id,
        long hostMemberId,
        String hostName,
        String hostAvatarUrl,
        Long guestMemberId,
        String guestName,
        String guestAvatarUrl,
        RoomVisibility visibility,
        GomokuRule rule,
        RoomStatus status,
        boolean hostReady,
        boolean guestReady,
        int gameNumber,
        long blackMemberId,
        String board,
        int ply,
        Integer lastX,
        Integer lastY,
        Long winnerMemberId,
        String endReason,
        long revision,
        long serverNow,
        Long turnDeadline) {
    public static GomokuRoomResponse from(GomokuRoomResult value) {
        return new GomokuRoomResponse(
                value.id(),
                value.hostMemberId(),
                value.hostName(),
                value.hostGithubId() == null ? null : GithubAvatarUrl.from(value.hostGithubId()),
                value.guestMemberId(),
                value.guestName(),
                value.guestGithubId() == null ? null : GithubAvatarUrl.from(value.guestGithubId()),
                value.visibility(),
                value.rule(),
                value.status(),
                value.hostReady(),
                value.guestReady(),
                value.gameNumber(),
                value.blackMemberId(),
                value.board(),
                value.ply(),
                value.lastX(),
                value.lastY(),
                value.winnerMemberId(),
                value.endReason(),
                value.revision(),
                value.serverNow(),
                value.turnDeadline());
    }
}

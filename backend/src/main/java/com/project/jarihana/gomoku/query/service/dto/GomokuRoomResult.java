package com.project.jarihana.gomoku.query.service.dto;

import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.gomoku.query.repository.dto.GomokuRoomProjection;

import java.time.Clock;

public record GomokuRoomResult(
        long id,
        long hostMemberId,
        String hostName,
        String hostGithubId,
        Long guestMemberId,
        String guestName,
        String guestGithubId,
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
    public static GomokuRoomResult from(GomokuRoomProjection row, Clock clock) {
        return new GomokuRoomResult(
                row.getId(),
                row.getHostMemberId(),
                row.getHostName(),
                row.getHostGithubId(),
                row.getGuestMemberId(),
                row.getGuestName(),
                row.getGuestGithubId(),
                row.getVisibility(),
                row.getRule(),
                row.getStatus(),
                row.getHostReady(),
                row.getGuestReady(),
                row.getGameNumber(),
                row.getBlackMemberId(),
                row.getBoard(),
                row.getPly(),
                row.getLastX(),
                row.getLastY(),
                row.getWinnerMemberId(),
                row.getEndReason(),
                row.getRevision(),
                clock.millis(),
                row.getTurnDeadline() == null
                        ? null
                        : row.getTurnDeadline().atZone(clock.getZone()).toInstant().toEpochMilli());
    }

    public boolean contains(long memberId) {
        return hostMemberId == memberId || java.util.Objects.equals(guestMemberId, memberId);
    }
}

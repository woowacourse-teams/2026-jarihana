package com.project.jarihana.gomoku.query.repository.dto;

import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;

import java.time.LocalDateTime;

public interface GomokuRoomProjection {
    long getId();

    long getHostMemberId();

    String getHostName();

    String getHostGithubId();

    Long getGuestMemberId();

    String getGuestName();

    String getGuestGithubId();

    RoomVisibility getVisibility();

    GomokuRule getRule();

    RoomStatus getStatus();

    boolean getHostReady();

    boolean getGuestReady();

    int getGameNumber();

    long getBlackMemberId();

    String getBoard();

    int getPly();

    Integer getLastX();

    Integer getLastY();

    Long getWinnerMemberId();

    String getEndReason();

    long getRevision();

    LocalDateTime getCreatedAt();

    LocalDateTime getTurnDeadline();
}

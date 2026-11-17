package com.project.jarihana.rhythmbattle.query.repository.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.domain.BattleEndReason;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.domain.BattleVisibility;

import java.time.LocalDateTime;

public interface RhythmBattleRoomProjection {
    long getId();

    long getHostMemberId();

    String getHostName();

    String getHostGithubId();

    Long getGuestMemberId();

    String getGuestName();

    String getGuestGithubId();

    BattleVisibility getVisibility();

    RhythmLevel getLevel();

    BattleRoomStatus getStatus();

    boolean getHostReady();

    boolean getGuestReady();

    double getHostScrollSpeed();

    double getGuestScrollSpeed();

    int getGameNumber();

    int getSeed();

    LocalDateTime getStartsAt();

    Long getWinnerMemberId();

    BattleEndReason getEndReason();

    long getRevision();

    LocalDateTime getCreatedAt();
}

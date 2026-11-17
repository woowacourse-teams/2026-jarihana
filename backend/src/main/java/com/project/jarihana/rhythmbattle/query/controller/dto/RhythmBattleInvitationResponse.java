package com.project.jarihana.rhythmbattle.query.controller.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleInvitationResult;

public record RhythmBattleInvitationResponse(long roomId, String hostName, RhythmLevel level, BattleRoomStatus status,
        boolean joinable) {
    public static RhythmBattleInvitationResponse from(RhythmBattleInvitationResult result) {
        return new RhythmBattleInvitationResponse(result.roomId(), result.hostName(), result.level(), result.status(),
                result.joinable());
    }
}

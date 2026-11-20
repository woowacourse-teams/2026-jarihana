package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRoomProjection;

/**
 * 초대 링크로 들어오기 전에 보여 줄 방 정보다. 빈자리가 있는 대기 방이어야 들어올 수 있다.
 */
public record RhythmBattleInvitationResult(long roomId, String hostName, RhythmLevel level, BattleRoomStatus status,
        boolean joinable) {
    public static RhythmBattleInvitationResult from(RhythmBattleRoomProjection room) {
        boolean joinable = room.getStatus() == BattleRoomStatus.WAITING && room.getGuestMemberId() == null;
        return new RhythmBattleInvitationResult(room.getId(), room.getHostName(), room.getLevel(), room.getStatus(),
                joinable);
    }
}

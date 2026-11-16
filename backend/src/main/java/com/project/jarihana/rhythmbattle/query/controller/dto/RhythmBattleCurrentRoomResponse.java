package com.project.jarihana.rhythmbattle.query.controller.dto;

/**
 * 지금 앉아 있는 대전 방이다. 없으면 roomId가 null이다.
 */
public record RhythmBattleCurrentRoomResponse(Long roomId) {
}

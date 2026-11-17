package com.project.jarihana.rhythmbattle.command.controller.dto;

/**
 * 초대 전용 방은 초대 링크의 토큰이 있어야 들어온다. 공개 방은 토큰 없이 들어온다.
 */
public record RhythmBattleJoinRequest(String token) {
}

package com.project.jarihana.rhythmbattle.command.controller.dto;

/**
 * 초대 링크에 넣을 토큰 원문이다. 서버는 해시만 저장하므로 이 응답에서만 받을 수 있다.
 */
public record RhythmBattleInviteResponse(String token) {
}

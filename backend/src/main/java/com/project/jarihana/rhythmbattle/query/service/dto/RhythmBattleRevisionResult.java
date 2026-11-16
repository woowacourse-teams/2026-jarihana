package com.project.jarihana.rhythmbattle.query.service.dto;

/**
 * 실시간 연결이 방의 변경을 알아채는 데 쓰는 값이다. revision은 판, latestChatId는 채팅의 변경을 나타낸다.
 */
public record RhythmBattleRevisionResult(long revision, long latestChatId) {
}

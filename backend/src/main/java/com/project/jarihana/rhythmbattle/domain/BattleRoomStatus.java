package com.project.jarihana.rhythmbattle.domain;

/**
 * 대전 방은 대기에서 진행, 결과로 가고 결과에서 다시 진행할 수 있다. 닫힌 방은 다시 열지 않는다.
 */
public enum BattleRoomStatus {
    WAITING,
    PLAYING,
    FINISHED,
    CLOSED
}

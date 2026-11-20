package com.project.jarihana.rhythmbattle.domain;

/**
 * 한 판이 끝난 이유다. 먼저 탈락한 쪽이 지거나, 기권한 쪽이 지거나, 같은 시각에 탈락해 비긴다.
 */
public enum BattleEndReason {
    ELIMINATED,
    FORFEIT,
    DRAW
}

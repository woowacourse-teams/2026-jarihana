package com.project.jarihana.rhythmbattle.domain;

/**
 * 한 사람의 판이 끝난 이유다. 라이프를 모두 잃은 탈락 말고는 모두 기권으로 본다.
 */
public enum BattleOutReason {
    // 서버 계산에서 라이프를 모두 잃었다.
    ELIMINATED,
    // 나가기, Esc, 탭 전환이나 창 이탈로 판을 떠났다.
    ABANDONED,
    // 30초 동안 입력 묶음이 오지 않았다.
    STALE,
    // 진행이 실제 시간보다 크게 늦었다(멈췄다가 이어 했다).
    LAGGED,
    // 진행이 실제 시간보다 앞섰다(미리 만든 입력).
    CLOCK_AHEAD;

    public boolean forfeit() {
        return this != ELIMINATED;
    }
}

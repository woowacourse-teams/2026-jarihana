package com.project.jarihana.rhythm.domain;

/**
 * 공식 도전이 기록 없이 무효가 된 이유다. 일시정지가 없으므로 진행이 멈추거나 화면을 떠나면 무효다.
 */
public enum RhythmInvalidReason {
    // 클라이언트가 Esc, 탭 전환, 창 이탈을 알렸다.
    ABANDONED,
    // 보낸 진행 시각이 서버 경과 시간보다 너무 늦다. 멈췄다가 이어 한 것으로 본다.
    LAGGED,
    // 보낸 진행 시각이 서버 경과 시간보다 앞선다.
    CLOCK_AHEAD,
    // 진행 중인데 입력 묶음이 끊겼다.
    STALE,
    // 만든 뒤 시작하지 않았다.
    EXPIRED
}

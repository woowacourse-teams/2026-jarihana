package com.project.jarihana.rhythm.domain;

/**
 * 서버가 다시 계산한 한 판의 점수와 판정 수다.
 */
public record RhythmScore(long score, int perfect, int hit, int enough, int uhoh, int poor, int miss,
        int bestCombo, int loopReached) {
    public static final RhythmScore EMPTY = new RhythmScore(0, 0, 0, 0, 0, 0, 0, 0, 1);
}

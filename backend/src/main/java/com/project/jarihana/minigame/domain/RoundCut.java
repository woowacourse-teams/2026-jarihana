package com.project.jarihana.minigame.domain;

/**
 * 막대 하나를 자른 뒤의 결과다. 제한 시간을 넘기면 판정 점수와 관계없이 0점으로 기록한다.
 */
public record RoundCut(
        MinigameRun run,
        int round,
        double position,
        CutJudgement judgement,
        long durationMillis,
        boolean timedOut
) {

    public int score() {
        if (timedOut) {
            return 0;
        }
        return judgement.score();
    }
}

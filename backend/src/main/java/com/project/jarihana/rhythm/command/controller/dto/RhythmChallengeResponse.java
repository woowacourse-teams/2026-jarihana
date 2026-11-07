package com.project.jarihana.rhythm.command.controller.dto;

import com.project.jarihana.rhythm.domain.RhythmChallenge;
import com.project.jarihana.rhythm.domain.RhythmChallengeStatus;
import com.project.jarihana.rhythm.domain.RhythmInvalidReason;
import com.project.jarihana.rhythm.domain.RhythmLevel;

import java.time.LocalDateTime;

/**
 * 공식 도전의 현재 상태다. 점수와 판정 수는 서버가 받은 입력으로 다시 계산한 값이다.
 */
public record RhythmChallengeResponse(
        long challengeId,
        RhythmLevel level,
        double scrollSpeed,
        int seed,
        String rulesVersion,
        String chartVersion,
        RhythmChallengeStatus status,
        int sequence,
        long score,
        int lives,
        int bestCombo,
        int loopReached,
        int perfect,
        int hit,
        int enough,
        int uhoh,
        int poor,
        int miss,
        RhythmInvalidReason invalidReason,
        LocalDateTime finishedAt
) {
    public static RhythmChallengeResponse from(RhythmChallenge challenge) {
        return new RhythmChallengeResponse(challenge.getId(), challenge.getLevel(), challenge.getScrollSpeed(),
                challenge.getSeed(), challenge.getRulesVersion(), challenge.getChartVersion(), challenge.getStatus(),
                challenge.getLastSequence(), challenge.getScore(), challenge.getLives(), challenge.getBestCombo(),
                challenge.getLoopReached(), challenge.getPerfectCount(), challenge.getHitCount(),
                challenge.getEnoughCount(), challenge.getUhohCount(), challenge.getPoorCount(),
                challenge.getMissCount(), challenge.getInvalidReason(), challenge.getFinishedAt());
    }
}

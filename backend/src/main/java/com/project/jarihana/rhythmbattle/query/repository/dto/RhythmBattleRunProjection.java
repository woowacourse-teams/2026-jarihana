package com.project.jarihana.rhythmbattle.query.repository.dto;

import com.project.jarihana.rhythmbattle.domain.BattleOutReason;
import com.project.jarihana.rhythmbattle.domain.BattleRunStatus;

public interface RhythmBattleRunProjection {
    long getMemberId();

    BattleRunStatus getStatus();

    BattleOutReason getOutReason();

    Double getOutAt();

    double getPlayedUntil();

    int getLastSequence();

    double getScrollSpeed();

    long getScore();

    int getCombo();

    int getBestCombo();

    int getLives();

    int getLoopReached();

    int getPerfectCount();

    int getHitCount();

    int getEnoughCount();

    int getUhohCount();

    int getPoorCount();

    int getMissCount();
}

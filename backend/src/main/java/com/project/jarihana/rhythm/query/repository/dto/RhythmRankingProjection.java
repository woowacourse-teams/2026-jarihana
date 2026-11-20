package com.project.jarihana.rhythm.query.repository.dto;

import java.time.LocalDateTime;

public interface RhythmRankingProjection {
    long getMemberId();

    long getChallengeId();

    long getScore();

    int getBestCombo();

    int getLoopReached();

    LocalDateTime getFinishedAt();

    String getName();

    String getGithubId();

    long getRank();
}

package com.project.jarihana.rhythmbattle.query.repository.dto;

public interface RhythmBattleBatchProjection {
    long getId();

    long getMemberId();

    int getSequence();

    double getPlayedUntil();

    String getInputs();
}

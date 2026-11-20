package com.project.jarihana.rhythm.domain;

public enum RhythmChallengeStatus {
    CREATED,
    PLAYING,
    FINISHED,
    INVALID;

    public boolean closed() {
        return this == FINISHED || this == INVALID;
    }
}

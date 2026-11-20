package com.project.jarihana.rhythmbattle.query.repository.dto;

public interface RhythmBattleRevisionProjection {
    long getId();

    long getRevision();

    long getLatestChatId();
}

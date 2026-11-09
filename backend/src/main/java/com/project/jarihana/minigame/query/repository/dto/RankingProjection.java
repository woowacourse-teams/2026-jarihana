package com.project.jarihana.minigame.query.repository.dto;

public interface RankingProjection {

    Long getRanking();

    Long getMemberId();

    String getNickname();

    Integer getTotalScore();

    Long getTotalDurationMillis();
}

package com.project.jarihana.sparring.query.repository.dto;

import java.time.LocalDateTime;

public interface SparringTopicProjection {
    Long getId();

    String getTitle();

    String getClaimA();

    String getClaimB();

    String getDescription();

    long getRevision();

    long getVotesA();

    long getVotesB();

    long getPostCount();

    String getMySide();

    LocalDateTime getCreatedAt();
}

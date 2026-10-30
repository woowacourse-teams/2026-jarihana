package com.project.jarihana.sparring.query.service.dto;

import com.project.jarihana.sparring.query.repository.dto.SparringTopicProjection;

import java.time.LocalDateTime;

public record SparringTopicResult(
        long id,
        String title,
        String a,
        String b,
        String description,
        long votesA,
        long votesB,
        long postCount,
        long revision,
        String mySide,
        LocalDateTime createdAt,
        LocalDateTime closesAt,
        String representativeImageUrl) {
    public static SparringTopicResult from(SparringTopicProjection p, String representativeImageUrl) {
        return new SparringTopicResult(
                p.getId(),
                p.getTitle(),
                p.getClaimA(),
                p.getClaimB(),
                p.getDescription(),
                p.getVotesA(),
                p.getVotesB(),
                p.getPostCount(),
                p.getRevision(),
                p.getMySide(),
                p.getCreatedAt(),
                p.getClosesAt(),
                representativeImageUrl);
    }
}

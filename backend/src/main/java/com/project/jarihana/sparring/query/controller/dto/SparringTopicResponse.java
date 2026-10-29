package com.project.jarihana.sparring.query.controller.dto;

import com.project.jarihana.sparring.query.service.dto.SparringTopicResult;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

public record SparringTopicResponse(
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
        OffsetDateTime closesAt,
        String representativeImageUrl) {
    public static SparringTopicResponse from(SparringTopicResult r) {
        return new SparringTopicResponse(
                r.id(),
                r.title(),
                r.a(),
                r.b(),
                r.description(),
                r.votesA(),
                r.votesB(),
                r.postCount(),
                r.revision(),
                r.mySide(),
                r.createdAt(),
                r.closesAt() == null
                        ? null
                        : r.closesAt().atZone(ZoneId.of("Asia/Seoul")).toOffsetDateTime(),
                r.representativeImageUrl());
    }
}

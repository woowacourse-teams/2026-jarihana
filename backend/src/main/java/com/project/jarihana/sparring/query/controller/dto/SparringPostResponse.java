package com.project.jarihana.sparring.query.controller.dto;

import com.project.jarihana.sparring.query.service.dto.SparringPostResult;

import java.time.LocalDateTime;

public record SparringPostResponse(
        long id,
        long authorId,
        String name,
        String memberType,
        String side,
        String text,
        LocalDateTime createdAt,
        Reply replyTo) {
    public record Reply(
            long id, long authorId, String name, String memberType, String side, String text) {}

    public static SparringPostResponse from(SparringPostResult r) {
        SparringPostResult.Reply p = r.replyTo();
        return new SparringPostResponse(
                r.id(),
                r.authorId(),
                r.name(),
                r.memberType(),
                r.side(),
                r.text(),
                r.createdAt(),
                p == null
                        ? null
                        : new Reply(
                                p.id(),
                                p.authorId(),
                                p.name(),
                                p.memberType(),
                                p.side(),
                                p.text()));
    }
}

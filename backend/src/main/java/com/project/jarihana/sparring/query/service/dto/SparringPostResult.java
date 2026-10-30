package com.project.jarihana.sparring.query.service.dto;

import com.project.jarihana.sparring.query.repository.dto.SparringPostProjection;

import java.time.LocalDateTime;

public record SparringPostResult(
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

    public static SparringPostResult from(SparringPostProjection p) {
        Reply reply =
                p.getReplyToId() == null
                        ? null
                        : new Reply(
                                p.getReplyToId(),
                                p.getReplyAuthorId(),
                                p.getReplyName(),
                                p.getReplyMemberType(),
                                p.getReplySide(),
                                p.getReplyText());
        return new SparringPostResult(
                p.getId(),
                p.getAuthorId(),
                p.getName(),
                p.getMemberType(),
                p.getSide(),
                p.getText(),
                p.getCreatedAt(),
                reply);
    }
}

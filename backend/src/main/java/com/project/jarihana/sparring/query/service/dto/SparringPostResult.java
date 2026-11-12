package com.project.jarihana.sparring.query.service.dto;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.sparring.query.repository.dto.SparringPostProjection;

import java.time.LocalDateTime;
import java.util.Map;

public record SparringPostResult(
        long id,
        long authorId,
        String name,
        String memberType,
        String side,
        String text,
        LocalDateTime createdAt,
        Reply replyTo,
        AvatarAppearance appearance) {
    public record Reply(
            long id,
            long authorId,
            String name,
            String memberType,
            String side,
            String text,
            AvatarAppearance appearance) {}

    public static SparringPostResult from(
            SparringPostProjection p, Map<Long, AvatarAppearance> appearances) {
        Reply reply =
                p.getReplyToId() == null
                        ? null
                        : new Reply(
                                p.getReplyToId(),
                                p.getReplyAuthorId(),
                                p.getReplyName(),
                                p.getReplyMemberType(),
                                p.getReplySide(),
                                p.getReplyText(),
                                appearances.get(p.getReplyAuthorId()));
        return new SparringPostResult(
                p.getId(),
                p.getAuthorId(),
                p.getName(),
                p.getMemberType(),
                p.getSide(),
                p.getText(),
                p.getCreatedAt(),
                reply,
                appearances.get(p.getAuthorId()));
    }
}

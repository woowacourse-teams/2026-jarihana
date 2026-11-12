package com.project.jarihana.sparring.query.controller.dto;

import com.project.jarihana.member.domain.AvatarAppearance;
import com.project.jarihana.member.query.controller.dto.MemberAvatarResponse.AppearanceResponse;
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
        Reply replyTo,
        AppearanceResponse appearance) {
    public record Reply(
            long id,
            long authorId,
            String name,
            String memberType,
            String side,
            String text,
            AppearanceResponse appearance) {}

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
                                p.text(),
                                toResponse(p.appearance())),
                toResponse(r.appearance()));
    }

    private static AppearanceResponse toResponse(AvatarAppearance appearance) {
        return appearance == null ? null : AppearanceResponse.from(appearance);
    }
}

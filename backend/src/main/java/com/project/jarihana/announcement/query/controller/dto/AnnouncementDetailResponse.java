package com.project.jarihana.announcement.query.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.project.jarihana.announcement.query.service.dto.AnnouncementDetailResult;

import java.time.LocalDateTime;

public record AnnouncementDetailResponse(long id, String title, String content, String scope,
                                         String authorNickname, LocalDateTime createdAt,
                                         @JsonInclude(JsonInclude.Include.NON_NULL) Boolean canManage) {

    public static AnnouncementDetailResponse from(AnnouncementDetailResult result, boolean includeManagement) {
        return new AnnouncementDetailResponse(result.id(), result.title(), result.content(), result.scope().name(),
                result.authorNickname(), result.createdAt(), includeManagement ? result.canManage() : null);
    }
}

package com.project.jarihana.announcement.command.controller.dto;

import com.project.jarihana.announcement.command.service.dto.CreateAnnouncementResult;

public record AnnouncementCreatedResponse(long id) {

    public static AnnouncementCreatedResponse from(CreateAnnouncementResult result) {
        return new AnnouncementCreatedResponse(result.id());
    }
}

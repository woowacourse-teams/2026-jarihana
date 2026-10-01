package com.project.jarihana.activitypost.command.controller.dto;

import com.project.jarihana.activitypost.command.service.dto.SaveActivityPostResult;

public record ActivityPostResponse(Long id) {

    public static ActivityPostResponse from(SaveActivityPostResult result) {
        return new ActivityPostResponse(result.id());
    }
}

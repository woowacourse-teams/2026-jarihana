package com.project.jarihana.activitypost.query.controller.dto;

import com.project.jarihana.activitypost.query.service.dto.ActivityReactionResult;

public record ActivityReactionResponse(String emoji, long count, boolean reacted) {

    public static ActivityReactionResponse from(ActivityReactionResult result) {
        return new ActivityReactionResponse(result.emoji(), result.count(), result.reacted());
    }
}

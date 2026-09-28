package com.project.jarihana.feedback.command.controller.dto;

import com.project.jarihana.feedback.command.service.dto.CreateFeedbackResult;

public record CreateFeedbackResponse(long id) {

    public static CreateFeedbackResponse from(CreateFeedbackResult result) {
        return new CreateFeedbackResponse(result.id());
    }
}

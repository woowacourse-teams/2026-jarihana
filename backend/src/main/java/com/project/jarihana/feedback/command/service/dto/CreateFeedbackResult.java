package com.project.jarihana.feedback.command.service.dto;

import com.project.jarihana.feedback.domain.Feedback;

public record CreateFeedbackResult(long id) {

    public static CreateFeedbackResult from(Feedback feedback) {
        return new CreateFeedbackResult(feedback.getId());
    }
}

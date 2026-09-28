package com.project.jarihana.feedback.command.controller.dto;

import com.project.jarihana.feedback.command.service.dto.CreateFeedbackCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFeedbackRequest(
        @NotBlank @Size(max = 1_000) String content
) {

    public CreateFeedbackCommand toCommand() {
        return new CreateFeedbackCommand(content);
    }
}

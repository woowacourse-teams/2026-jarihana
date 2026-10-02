package com.project.jarihana.activitypost.command.controller.dto;

import com.project.jarihana.activitypost.command.service.dto.SaveActivityPostCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ModifyActivityPostRequest(
        @Size(max = 255) String imageKey,
        @Size(max = 50) String caption,
        LocalDate activityDate
) {

    public SaveActivityPostCommand toCommand() {
        return new SaveActivityPostCommand(imageKey, caption, activityDate);
    }
}

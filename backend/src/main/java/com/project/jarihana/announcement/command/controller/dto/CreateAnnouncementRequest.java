package com.project.jarihana.announcement.command.controller.dto;

import com.project.jarihana.announcement.command.service.dto.CreateAnnouncementCommand;
import com.project.jarihana.announcement.domain.AnnouncementScope;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateAnnouncementRequest(
        @NotBlank @Size(max = 100) String title,
        @NotBlank @Size(max = 10_000) String content,
        @NotNull AnnouncementScope scope
) {

    public CreateAnnouncementCommand toCommand() {
        return new CreateAnnouncementCommand(title, content, scope);
    }
}

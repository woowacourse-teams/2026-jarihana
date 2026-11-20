package com.project.jarihana.groupmusic.command.controller.dto;

import com.project.jarihana.groupmusic.command.service.dto.AddMusicQueueCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddMusicQueueRequest(@NotBlank @Size(max = 80) String title,
                                   @NotBlank @Size(max = 500) String url) {
    public AddMusicQueueCommand toCommand() {
        return new AddMusicQueueCommand(title, url);
    }
}

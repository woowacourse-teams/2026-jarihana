package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.ModifyGroupCommand;
import com.project.jarihana.group.domain.MeetingType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ModifyGroupRequest(
        @NotBlank
        @Size(max = 50)
        String name,
        @NotBlank
        @Size(max = 100)
        String introduction,
        @Size(max = 5_000)
        String description,
        @NotNull MeetingType meetingType,
        @Size(max = 255)
        String location
) {

    public ModifyGroupCommand toCommand() {
        return new ModifyGroupCommand(name, introduction, description, meetingType, location);
    }
}

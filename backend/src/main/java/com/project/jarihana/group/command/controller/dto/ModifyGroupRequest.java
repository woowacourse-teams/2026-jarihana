package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.ModifyGroupCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ModifyGroupRequest(
        @NotBlank
        @Size(max = 50)
        String name,
        @NotBlank
        @Size(max = 100)
        String introduction,
        @Size(max = 5_000)
        String description
) {

    public ModifyGroupCommand toCommand() {
        return new ModifyGroupCommand(name, introduction, description);
    }
}

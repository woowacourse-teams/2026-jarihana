package com.project.jarihana.group.command.service.dto;

public record ModifyGroupCommand(
        String name,
        String introduction,
        String description
) {
}

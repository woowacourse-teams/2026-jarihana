package com.project.jarihana.group.command.controller.dto;

import com.project.jarihana.group.command.service.dto.TerminateGroupCommand;
import com.project.jarihana.group.domain.GroupStatus;

public record TerminateGroupRequest(GroupStatus status) {

    public TerminateGroupCommand toCommand() {
        return new TerminateGroupCommand(status);
    }
}

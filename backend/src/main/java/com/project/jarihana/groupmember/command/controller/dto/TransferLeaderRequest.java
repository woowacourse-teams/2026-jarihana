package com.project.jarihana.groupmember.command.controller.dto;

import com.project.jarihana.groupmember.command.service.dto.TransferLeaderCommand;
import jakarta.validation.constraints.Positive;

public record TransferLeaderRequest(@Positive long groupMemberId) {

    public TransferLeaderCommand toCommand() {
        return new TransferLeaderCommand(groupMemberId);
    }
}

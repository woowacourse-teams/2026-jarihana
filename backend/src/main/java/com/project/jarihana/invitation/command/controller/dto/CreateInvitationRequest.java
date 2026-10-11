package com.project.jarihana.invitation.command.controller.dto;

import com.project.jarihana.invitation.command.service.dto.CreateInvitationCommand;
import com.project.jarihana.invitation.domain.InvitationType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

public record CreateInvitationRequest(@NotNull InvitationType type, @Positive Long targetMemberId, String message,
                                      @NotNull UUID requestId) {
    public CreateInvitationCommand toCommand() {
        return new CreateInvitationCommand(type, targetMemberId, message, requestId);
    }
}

package com.project.jarihana.invitation.command.controller.dto;

import com.project.jarihana.invitation.command.service.dto.AcceptInvitationCommand;

public record AcceptInvitationRequest(String token) {
    public AcceptInvitationCommand toCommand() { return new AcceptInvitationCommand(token); }

    @Override
    public String toString() { return "AcceptInvitationRequest"; }
}

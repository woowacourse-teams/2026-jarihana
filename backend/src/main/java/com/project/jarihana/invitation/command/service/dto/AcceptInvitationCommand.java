package com.project.jarihana.invitation.command.service.dto;

public record AcceptInvitationCommand(String token) {
    @Override
    public String toString() { return "AcceptInvitationCommand"; }
}

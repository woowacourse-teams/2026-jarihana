package com.project.jarihana.invitation.command.controller.dto;

import com.project.jarihana.invitation.command.service.dto.RevokeInvitationResult;

import java.time.LocalDateTime;

public record RevokeInvitationResponse(long id, LocalDateTime revokedAt, String status) {
    public static RevokeInvitationResponse from(RevokeInvitationResult result) {
        return new RevokeInvitationResponse(result.id(), result.revokedAt(), result.status().name());
    }
}

package com.project.jarihana.invitation.command.service.dto;

import com.project.jarihana.invitation.domain.InvitationStatus;

import java.time.LocalDateTime;

public record RevokeInvitationResult(long id, LocalDateTime revokedAt, InvitationStatus status) { }

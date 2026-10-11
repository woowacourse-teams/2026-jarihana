package com.project.jarihana.invitation.command.service.dto;

import com.project.jarihana.invitation.domain.InvitationType;

import java.util.UUID;

public record CreateInvitationCommand(InvitationType type, Long targetMemberId, String message, UUID requestId) { }

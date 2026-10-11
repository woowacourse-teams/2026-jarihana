package com.project.jarihana.invitation.command.service.dto;

import com.project.jarihana.invitation.domain.InvitationStatus;
import com.project.jarihana.invitation.domain.InvitationType;

import java.time.LocalDateTime;

public record CreateInvitationResult(long id, long groupId, InvitationType type, Long targetMemberId, LocalDateTime createdAt, LocalDateTime expiresAt, InvitationStatus status,
                                     String sharePath, boolean reused) { }

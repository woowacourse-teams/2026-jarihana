package com.project.jarihana.invitation.command.service.dto;

import java.time.LocalDateTime;

public record AcceptInvitationResult(boolean joined, long invitationId, long groupId,
                                     long groupMemberId, LocalDateTime joinedAt) { }

package com.project.jarihana.invitation.query.repository.dto;

import com.project.jarihana.invitation.domain.InvitationType;

import java.time.LocalDateTime;

public record ReceivedInvitationProjection(long id, InvitationType type, long groupId, String groupName,
                                          long inviterId, String inviterCrewName, LocalDateTime createdAt, LocalDateTime expiresAt, LocalDateTime revokedAt,
                                          boolean groupActive, boolean inviterPresent, boolean accepted) { }

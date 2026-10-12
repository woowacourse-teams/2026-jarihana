package com.project.jarihana.invitation.query.repository.dto;

import com.project.jarihana.invitation.domain.InvitationType;
import com.project.jarihana.invitation.domain.InvitationState;

import java.time.LocalDateTime;

public record InvitationDetailProjection(long id, InvitationType type, long groupId, String groupName,
        String groupIntroduction, long inviterId, String inviterCrewName, Long targetId, LocalDateTime createdAt, LocalDateTime expiresAt, LocalDateTime revokedAt, boolean groupActive,
        boolean inviterPresent, boolean accepted, boolean viewerPresent, boolean viewerLeader,
        String tokenHash, String encryptedToken, InvitationState state) {
    @Override
    public String toString() { return "InvitationDetailProjection[id=" + id + "]"; }
}

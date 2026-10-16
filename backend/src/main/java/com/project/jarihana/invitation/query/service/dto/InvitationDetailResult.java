package com.project.jarihana.invitation.query.service.dto;

import com.project.jarihana.invitation.domain.InvitationStatus;
import com.project.jarihana.invitation.domain.InvitationType;

import java.time.LocalDateTime;

public record InvitationDetailResult(long id, InvitationType type, long groupId, String groupName,
        String groupIntroduction, long inviterId, String inviterCrewName, LocalDateTime createdAt, LocalDateTime expiresAt, InvitationStatus status,
        boolean canAccept, boolean canRevoke, String sharePath) {
    @Override
    public String toString() { return "InvitationDetailResult[id=" + id + ", status=" + status + "]"; }
}

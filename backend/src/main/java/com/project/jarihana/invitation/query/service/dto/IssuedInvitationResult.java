package com.project.jarihana.invitation.query.service.dto;

import com.project.jarihana.invitation.domain.InvitationStatus;
import com.project.jarihana.invitation.domain.InvitationType;

import java.time.LocalDateTime;
import java.util.List;

public record IssuedInvitationResult(List<Item> items, String nextCursor, boolean hasNext) {
    public IssuedInvitationResult { items = List.copyOf(items); }
    public record Item(long id, InvitationType type, long groupId, String groupName, long inviterId,
            String inviterCrewName, Long targetMemberId, String targetMemberCrewName,
            LocalDateTime createdAt, LocalDateTime expiresAt,
            InvitationStatus status, boolean canRevoke) { }
}

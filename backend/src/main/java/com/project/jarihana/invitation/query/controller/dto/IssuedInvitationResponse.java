package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.IssuedInvitationResult;

import java.time.LocalDateTime;
import java.util.List;

public record IssuedInvitationResponse(List<ItemResponse> items, String nextCursor, boolean hasNext) {
    public IssuedInvitationResponse { items = List.copyOf(items); }
    public record GroupResponse(long id, String name) { }
    public record InviterResponse(long id, String crewName) { }
    public record ItemResponse(long id, String type, GroupResponse group, InviterResponse inviter,
            LocalDateTime createdAt,
            LocalDateTime expiresAt, String status, boolean canRevoke) { }

    public static IssuedInvitationResponse from(IssuedInvitationResult result) {
        return new IssuedInvitationResponse(result.items().stream().map(item -> new ItemResponse(item.id(),
                item.type().name(), new GroupResponse(item.groupId(), item.groupName()),
                new InviterResponse(item.inviterId(), item.inviterCrewName()), item.createdAt(),
                item.expiresAt(), item.status().name(), item.canRevoke())).toList(), result.nextCursor(), result.hasNext());
    }
}

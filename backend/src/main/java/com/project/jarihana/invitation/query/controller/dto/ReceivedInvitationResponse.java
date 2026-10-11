package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.ReceivedInvitationResult;

import java.time.LocalDateTime;
import java.util.List;

public record ReceivedInvitationResponse(List<ItemResponse> items, String nextCursor, boolean hasNext) {
    public ReceivedInvitationResponse { items = List.copyOf(items); }
    public record GroupResponse(long id, String name) { }
    public record InviterResponse(long id, String crewName) { }
    public record ItemResponse(long id, String type, GroupResponse group, InviterResponse inviter, String message,
                               LocalDateTime createdAt, LocalDateTime expiresAt, String status, boolean canRevoke) { }
    public static ReceivedInvitationResponse from(ReceivedInvitationResult result) {
        return new ReceivedInvitationResponse(result.items().stream().map(item -> new ItemResponse(item.id(), item.type().name(),
                new GroupResponse(item.groupId(), item.groupName()), new InviterResponse(item.inviterId(), item.inviterCrewName()),
                item.message(), item.createdAt(), item.expiresAt(), item.status().name(), item.canRevoke())).toList(),
                result.nextCursor(), result.hasNext());
    }
}

package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.InvitationDetailResult;

import java.time.LocalDateTime;

public record InvitationDetailResponse(long id, String type, GroupResponse group, InviterResponse inviter,
        LocalDateTime createdAt, LocalDateTime expiresAt, String status,
        boolean canAccept, boolean canRevoke, String sharePath) {
    public record GroupResponse(long id, String name, String introduction) { }
    public record InviterResponse(long id, String crewName) { }

    public static InvitationDetailResponse from(InvitationDetailResult result) {
        return new InvitationDetailResponse(result.id(), result.type().name(),
                new GroupResponse(result.groupId(), result.groupName(), result.groupIntroduction()),
                new InviterResponse(result.inviterId(), result.inviterCrewName()),
                result.createdAt(), result.expiresAt(), result.status().name(), result.canAccept(),
                result.canRevoke(), result.sharePath());
    }

    @Override
    public String toString() { return "InvitationDetailResponse[id=" + id + "]"; }
}

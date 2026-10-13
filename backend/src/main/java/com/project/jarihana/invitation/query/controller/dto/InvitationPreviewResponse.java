package com.project.jarihana.invitation.query.controller.dto;

import com.project.jarihana.invitation.query.service.dto.InvitationDetailResult;
import com.project.jarihana.invitation.query.controller.dto.InvitationDetailResponse.GroupResponse;
import com.project.jarihana.invitation.query.controller.dto.InvitationDetailResponse.InviterResponse;

import java.time.LocalDateTime;

public record InvitationPreviewResponse(long id, String type, GroupResponse group, InviterResponse inviter,
        LocalDateTime createdAt, LocalDateTime expiresAt, String status, boolean canAccept) {
    public static InvitationPreviewResponse from(InvitationDetailResult result) {
        return new InvitationPreviewResponse(result.id(), result.type().name(),
                new GroupResponse(result.groupId(), result.groupName(), result.groupIntroduction()),
                new InviterResponse(result.inviterId(), result.inviterCrewName()),
                result.createdAt(), result.expiresAt(), result.status().name(), result.canAccept());
    }
}

package com.project.jarihana.invitation.command.controller.dto;

import com.project.jarihana.invitation.command.service.dto.CreateInvitationResult;

import java.time.LocalDateTime;

public record CreateInvitationResponse(long id, long groupId, String type, Long targetMemberId, LocalDateTime createdAt, LocalDateTime expiresAt, String status,
                                       String sharePath, boolean reused) {
    public static CreateInvitationResponse from(CreateInvitationResult result) {
        return new CreateInvitationResponse(result.id(), result.groupId(), result.type().name(), result.targetMemberId(),
                result.createdAt(), result.expiresAt(), result.status().name(), result.sharePath(), result.reused());
    }
}

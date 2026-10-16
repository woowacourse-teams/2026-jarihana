package com.project.jarihana.invitation.command.controller.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.project.jarihana.invitation.command.service.dto.AcceptInvitationResult;

import java.time.LocalDateTime;

public record AcceptInvitationResponse(String result, long invitationId, long groupId, long groupMemberId,
        LocalDateTime joinedAt, @JsonInclude(JsonInclude.Include.NON_NULL) String registrationOrigin) {
    public static AcceptInvitationResponse from(AcceptInvitationResult result) {
        return new AcceptInvitationResponse(result.joined() ? "JOINED" : "ALREADY_JOINED", result.invitationId(),
                result.groupId(), result.groupMemberId(), result.joinedAt(), result.joined() ? "INVITATION" : null);
    }
}

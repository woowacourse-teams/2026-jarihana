package com.project.jarihana.invitation.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.invitation.command.controller.dto.CreateInvitationRequest;
import com.project.jarihana.invitation.command.controller.dto.CreateInvitationResponse;
import com.project.jarihana.invitation.command.controller.dto.RevokeInvitationResponse;
import com.project.jarihana.invitation.command.service.InvitationCommandService;
import com.project.jarihana.invitation.command.controller.dto.AcceptInvitationRequest;
import com.project.jarihana.invitation.command.controller.dto.AcceptInvitationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class InvitationCommandController {
    private final InvitationCommandService invitations;

    @PatchMapping("/invitations/{invitationId}/decline")
    public ResponseEntity<Void> declineInvitation(@LoginMember long memberId, @PathVariable long invitationId) {
        invitations.declineInvitation(memberId, invitationId);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/invitations/{invitationId}/acceptances")
    public ResponseEntity<ApiResponse<AcceptInvitationResponse>> acceptInvitation(@LoginMember long memberId,
            @PathVariable long invitationId, @RequestBody AcceptInvitationRequest request) {
        var result = invitations.acceptInvitation(memberId, invitationId, request.toCommand());
        return ResponseEntity.status(result.joined() ? 201 : 200).cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(AcceptInvitationResponse.from(result)));
    }

    @PatchMapping("/invitations/{invitationId}/revoke")
    public ResponseEntity<ApiResponse<RevokeInvitationResponse>> revokeInvitation(
            @LoginMember long memberId, @PathVariable long invitationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                RevokeInvitationResponse.from(invitations.revokeInvitation(memberId, invitationId))));
    }

    @PostMapping("/groups/{groupId}/invitations")
    public ResponseEntity<ApiResponse<CreateInvitationResponse>> createInvitation(@LoginMember long memberId,
            @PathVariable long groupId, @Validated @RequestBody CreateInvitationRequest request) {
        var result = invitations.createInvitation(memberId, groupId, request.toCommand());
        return ResponseEntity.status(result.reused() ? HttpStatus.OK : HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore()).body(ApiResponse.success(CreateInvitationResponse.from(result)));
    }
}

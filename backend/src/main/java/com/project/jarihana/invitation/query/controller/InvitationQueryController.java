package com.project.jarihana.invitation.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.invitation.query.controller.dto.InvitationCandidateRequest;
import com.project.jarihana.invitation.query.controller.dto.InvitationCandidateResponse;
import com.project.jarihana.invitation.query.controller.dto.ReceivedInvitationRequest;
import com.project.jarihana.invitation.query.controller.dto.ReceivedInvitationResponse;
import com.project.jarihana.invitation.query.controller.dto.IssuedInvitationRequest;
import com.project.jarihana.invitation.query.controller.dto.IssuedInvitationResponse;
import com.project.jarihana.invitation.query.controller.dto.InvitationDetailResponse;
import com.project.jarihana.invitation.query.controller.dto.InvitationPreviewResponse;
import com.project.jarihana.invitation.query.service.InvitationQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class InvitationQueryController {
    private final InvitationQueryService invitations;

    @GetMapping("/groups/{groupId}/invitations")
    public ResponseEntity<ApiResponse<IssuedInvitationResponse>> findIssuedInvitations(
            @LoginMember long memberId, @PathVariable long groupId, @Validated @ModelAttribute IssuedInvitationRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                IssuedInvitationResponse.from(invitations.findIssued(memberId, groupId, request.toQuery()))));
    }

    @GetMapping("/invitations/{invitationId}")
    public ResponseEntity<ApiResponse<InvitationDetailResponse>> findInvitationDetail(
            @LoginMember long memberId, @PathVariable long invitationId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                InvitationDetailResponse.from(invitations.findDetail(memberId, invitationId))));
    }

    @GetMapping("/invitations/links/{token}")
    public ResponseEntity<ApiResponse<InvitationPreviewResponse>> findInvitationPreview(@PathVariable String token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                InvitationPreviewResponse.from(invitations.previewLink(token))));
    }

    @GetMapping("/groups/{groupId}/invitation-candidates")
    public ResponseEntity<ApiResponse<InvitationCandidateResponse>> findInvitationCandidates(
            @LoginMember long memberId, @PathVariable long groupId, @Validated @ModelAttribute InvitationCandidateRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                InvitationCandidateResponse.from(invitations.findCandidates(memberId, groupId, request.toQuery()))));
    }

    @GetMapping("/invitations/received")
    public ResponseEntity<ApiResponse<ReceivedInvitationResponse>> findReceivedInvitations(
            @LoginMember long memberId, @Validated @ModelAttribute ReceivedInvitationRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                ReceivedInvitationResponse.from(invitations.findReceived(memberId, request.toQuery()))));
    }
}

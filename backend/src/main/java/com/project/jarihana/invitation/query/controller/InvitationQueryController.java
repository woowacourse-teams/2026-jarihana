package com.project.jarihana.invitation.query.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.invitation.query.controller.dto.InvitationCandidateRequest;
import com.project.jarihana.invitation.query.controller.dto.InvitationCandidateResponse;
import com.project.jarihana.invitation.query.controller.dto.ReceivedInvitationRequest;
import com.project.jarihana.invitation.query.controller.dto.ReceivedInvitationResponse;
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

package com.project.jarihana.proposal.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.proposal.command.controller.dto.CreateProposalCommentRequest;
import com.project.jarihana.proposal.command.controller.dto.ProposalCommentResponse;
import com.project.jarihana.proposal.command.service.ProposalCommentCommandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ProposalCommentCommandController {

    private final ProposalCommentCommandService proposalCommentCommandService;

    @PostMapping("/proposals/{proposalId}/comments")
    public ResponseEntity<ApiResponse<ProposalCommentResponse>> createComment(
            @LoginMember long memberId,
            @PathVariable long proposalId,
            @Valid @RequestBody CreateProposalCommentRequest request
    ) {
        long commentId = proposalCommentCommandService.create(memberId, proposalId, request.content());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(new ProposalCommentResponse(commentId)));
    }

    @DeleteMapping("/proposal-comments/{commentId}")
    public ResponseEntity<Void> removeComment(
            @LoginMember long memberId,
            @PathVariable long commentId
    ) {
        proposalCommentCommandService.delete(memberId, commentId);
        return ResponseEntity.noContent().build();
    }
}

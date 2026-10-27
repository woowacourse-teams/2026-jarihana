package com.project.jarihana.proposal.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.proposal.query.controller.dto.ProposalCommentListRequest;
import com.project.jarihana.proposal.query.controller.dto.ProposalCommentListResponse;
import com.project.jarihana.proposal.query.service.ProposalCommentQueryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ProposalCommentQueryController {

    private final ProposalCommentQueryService proposalCommentQueryService;
    private final LoginMemberReader loginMemberReader;

    @GetMapping("/proposals/{proposalId}/comments")
    public ResponseEntity<ApiResponse<ProposalCommentListResponse>> findComments(
            @PathVariable long proposalId,
            @Valid @ModelAttribute ProposalCommentListRequest request
    ) {
        ProposalCommentListResponse response = ProposalCommentListResponse.from(
                proposalCommentQueryService.findComments(
                        proposalId,
                        request.toQuery(),
                        loginMemberReader.currentMemberId().orElse(null)
                )
        );
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

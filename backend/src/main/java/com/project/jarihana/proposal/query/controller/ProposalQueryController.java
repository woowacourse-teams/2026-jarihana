package com.project.jarihana.proposal.query.controller;

import com.project.jarihana.common.auth.LoginMemberReader;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.proposal.query.controller.dto.ProposalDetailResponse;
import com.project.jarihana.proposal.query.controller.dto.ProposalListRequest;
import com.project.jarihana.proposal.query.controller.dto.ProposalListResponse;
import com.project.jarihana.proposal.query.service.ProposalQueryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ProposalQueryController {

    private final ProposalQueryService proposalQueryService;
    private final LoginMemberReader loginMemberReader;

    @GetMapping("/proposals")
    public ResponseEntity<ApiResponse<ProposalListResponse>> findProposals(
            @Valid @ModelAttribute ProposalListRequest request
    ) {
        ProposalListResponse response = ProposalListResponse.from(proposalQueryService.findProposals(
                request.toQuery(),
                loginMemberReader.currentMemberId().orElse(null)
        ));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/proposals/{proposalId}")
    public ResponseEntity<ApiResponse<ProposalDetailResponse>> findProposal(@PathVariable long proposalId) {
        ProposalDetailResponse response = ProposalDetailResponse.from(proposalQueryService.findProposal(
                proposalId,
                loginMemberReader.currentMemberId().orElse(null)
        ));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}

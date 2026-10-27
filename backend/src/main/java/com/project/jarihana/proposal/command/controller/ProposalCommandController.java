package com.project.jarihana.proposal.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.proposal.command.controller.dto.CreateProposalRequest;
import com.project.jarihana.proposal.command.controller.dto.ProposalResponse;
import com.project.jarihana.proposal.command.service.ProposalCommandService;
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
public class ProposalCommandController {

    private final ProposalCommandService proposalCommandService;

    @PostMapping("/proposals")
    public ResponseEntity<ApiResponse<ProposalResponse>> createProposal(
            @LoginMember long memberId,
            @Valid @RequestBody CreateProposalRequest request
    ) {
        long proposalId = proposalCommandService.create(request.toCommand(memberId));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(new ProposalResponse(proposalId)));
    }

    @DeleteMapping("/proposals/{proposalId}")
    public ResponseEntity<Void> removeProposal(
            @LoginMember long memberId,
            @PathVariable long proposalId
    ) {
        proposalCommandService.delete(memberId, proposalId);
        return ResponseEntity.noContent().build();
    }
}

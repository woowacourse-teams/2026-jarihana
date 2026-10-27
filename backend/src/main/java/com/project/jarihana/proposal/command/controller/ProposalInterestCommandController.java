package com.project.jarihana.proposal.command.controller;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.proposal.command.controller.dto.SaveProposalInterestRequest;
import com.project.jarihana.proposal.command.service.ProposalInterestCommandService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class ProposalInterestCommandController {

    private final ProposalInterestCommandService proposalInterestCommandService;

    @PutMapping("/proposals/{proposalId}/interest")
    public ResponseEntity<Void> saveInterest(
            @LoginMember long memberId,
            @PathVariable long proposalId,
            @RequestBody SaveProposalInterestRequest request
    ) {
        proposalInterestCommandService.save(request.toCommand(memberId, proposalId));
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/proposals/{proposalId}/interest")
    public ResponseEntity<Void> removeInterest(
            @LoginMember long memberId,
            @PathVariable long proposalId
    ) {
        proposalInterestCommandService.cancel(memberId, proposalId);
        return ResponseEntity.noContent().build();
    }
}

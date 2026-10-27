package com.project.jarihana.proposal.command.repository;

import com.project.jarihana.proposal.domain.ProposalInterest;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProposalInterestCommandRepository extends JpaRepository<ProposalInterest, Long> {

    Optional<ProposalInterest> findByProposalIdAndMemberId(long proposalId, long memberId);
}

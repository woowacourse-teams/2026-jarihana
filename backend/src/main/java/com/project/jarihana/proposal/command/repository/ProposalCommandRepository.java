package com.project.jarihana.proposal.command.repository;

import com.project.jarihana.proposal.domain.Proposal;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProposalCommandRepository extends JpaRepository<Proposal, Long> {

    Optional<Proposal> findByIdAndDeletedAtIsNull(long id);
}

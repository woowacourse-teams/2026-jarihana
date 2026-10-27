package com.project.jarihana.proposal.command.repository;

import com.project.jarihana.proposal.domain.ProposalComment;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProposalCommentCommandRepository extends JpaRepository<ProposalComment, Long> {

    Optional<ProposalComment> findByIdAndDeletedAtIsNullAndProposalDeletedAtIsNull(long id);
}

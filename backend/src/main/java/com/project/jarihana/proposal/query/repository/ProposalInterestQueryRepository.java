package com.project.jarihana.proposal.query.repository;

import com.project.jarihana.proposal.domain.ProposalInterest;
import com.project.jarihana.proposal.query.repository.dto.ProposalInterestProjection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProposalInterestQueryRepository extends JpaRepository<ProposalInterest, Long> {

    @Query("""
            select new com.project.jarihana.proposal.query.repository.dto.ProposalInterestProjection(
                interest.member.id,
                interest.timeSlots,
                interest.meetingModes,
                interest.moodIndexes
            )
            from ProposalInterest interest
            where interest.proposal.id = :proposalId
            """)
    List<ProposalInterestProjection> findAllByProposal(@Param("proposalId") long proposalId);
}

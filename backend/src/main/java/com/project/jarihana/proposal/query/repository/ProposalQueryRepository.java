package com.project.jarihana.proposal.query.repository;

import com.project.jarihana.proposal.domain.Proposal;
import com.project.jarihana.proposal.domain.ProposalCategory;
import com.project.jarihana.proposal.query.repository.dto.ProposalDetailProjection;
import com.project.jarihana.proposal.query.repository.dto.ProposalSummaryProjection;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProposalQueryRepository extends JpaRepository<Proposal, Long> {

    @Query("""
            select new com.project.jarihana.proposal.query.repository.dto.ProposalSummaryProjection(
                proposal.id,
                proposal.category,
                proposal.title,
                proposal.content,
                author.crewName,
                author.githubId,
                (
                    select count(interest.id) from ProposalInterest interest
                    where interest.proposal.id = proposal.id
                ),
                (
                    select count(comment.id) from ProposalComment comment
                    where comment.proposal.id = proposal.id
                      and comment.deletedAt is null
                ),
                case when :memberId is not null and exists (
                    select mine.id from ProposalInterest mine
                    where mine.proposal.id = proposal.id
                      and mine.member.id = :memberId
                ) then true else false end,
                proposal.createdAt
            )
            from Proposal proposal
            join proposal.author author
            where proposal.deletedAt is null
              and (:category is null or proposal.category = :category)
              and (
                  cast(:cursorCreatedAt as LocalDateTime) is null
                  or proposal.createdAt < :cursorCreatedAt
                  or (proposal.createdAt = :cursorCreatedAt and proposal.id < :cursorId)
              )
            order by proposal.createdAt desc, proposal.id desc
            """)
    List<ProposalSummaryProjection> findPage(
            @Param("category") ProposalCategory category,
            @Param("memberId") Long memberId,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("""
            select new com.project.jarihana.proposal.query.repository.dto.ProposalDetailProjection(
                proposal.id,
                proposal.category,
                proposal.title,
                proposal.content,
                proposal.moodOptions,
                author.crewName,
                author.githubId,
                proposal.createdAt,
                (
                    select count(comment.id) from ProposalComment comment
                    where comment.proposal.id = proposal.id
                      and comment.deletedAt is null
                ),
                case when :memberId is not null and author.id = :memberId then true else false end
            )
            from Proposal proposal
            join proposal.author author
            where proposal.id = :proposalId
              and proposal.deletedAt is null
            """)
    Optional<ProposalDetailProjection> findDetail(
            @Param("proposalId") long proposalId,
            @Param("memberId") Long memberId
    );

    boolean existsByIdAndDeletedAtIsNull(long id);
}

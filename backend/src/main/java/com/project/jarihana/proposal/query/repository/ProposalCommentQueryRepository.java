package com.project.jarihana.proposal.query.repository;

import com.project.jarihana.proposal.domain.ProposalComment;
import com.project.jarihana.proposal.query.repository.dto.ProposalCommentProjection;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProposalCommentQueryRepository extends JpaRepository<ProposalComment, Long> {

    @Query("""
            select new com.project.jarihana.proposal.query.repository.dto.ProposalCommentProjection(
                comment.id,
                author.crewName,
                author.githubId,
                comment.content,
                comment.createdAt,
                case when :memberId is not null and (
                    author.id = :memberId or proposal.author.id = :memberId
                ) then true else false end
            )
            from ProposalComment comment
            join comment.author author
            join comment.proposal proposal
            where proposal.id = :proposalId
              and comment.deletedAt is null
              and (
                  cast(:cursorCreatedAt as LocalDateTime) is null
                  or comment.createdAt > :cursorCreatedAt
                  or (comment.createdAt = :cursorCreatedAt and comment.id > :cursorId)
              )
            order by comment.createdAt asc, comment.id asc
            """)
    List<ProposalCommentProjection> findPage(
            @Param("proposalId") long proposalId,
            @Param("memberId") Long memberId,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );
}

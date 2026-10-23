package com.project.jarihana.activitypost.query.repository;

import com.project.jarihana.activitypost.domain.ActivityPostCommentReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.activitypost.query.repository.dto.ReactionCountProjection;
import com.project.jarihana.activitypost.query.repository.dto.ReactorProjection;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ActivityPostCommentReactionQueryRepository
        extends JpaRepository<ActivityPostCommentReaction, Long> {

    @Query("""
            select new com.project.jarihana.activitypost.query.repository.dto.ReactionCountProjection(
                reaction.comment.id,
                reaction.emoji,
                count(reaction.id),
                sum(case when reaction.member.id = :memberId then 1 else 0 end)
            )
            from ActivityPostCommentReaction reaction
            where reaction.comment.id in :commentIds
            group by reaction.comment.id, reaction.emoji
            """)
    List<ReactionCountProjection> countByCommentIds(
            @Param("commentIds") Collection<Long> commentIds,
            @Param("memberId") Long memberId
    );

    @Query("""
            select new com.project.jarihana.activitypost.query.repository.dto.ReactorProjection(
                reaction.id,
                reaction.createdAt,
                member.id,
                member.crewName,
                member.githubId,
                member.memberType,
                member.generation,
                member.course
            )
            from ActivityPostCommentReaction reaction
            join reaction.member member
            where reaction.comment.id = :commentId
              and reaction.emoji = :emoji
              and (
                  cast(:cursorReactedAt as LocalDateTime) is null
                  or reaction.createdAt > :cursorReactedAt
                  or (reaction.createdAt = :cursorReactedAt and reaction.id > :cursorId)
              )
            order by reaction.createdAt asc, reaction.id asc
            """)
    List<ReactorProjection> findReactors(
            @Param("commentId") long commentId,
            @Param("emoji") ReactionEmoji emoji,
            @Param("cursorReactedAt") LocalDateTime cursorReactedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    long countByCommentIdAndEmoji(long commentId, ReactionEmoji emoji);
}

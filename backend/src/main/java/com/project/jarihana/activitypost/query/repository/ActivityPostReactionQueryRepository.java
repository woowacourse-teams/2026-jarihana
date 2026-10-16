package com.project.jarihana.activitypost.query.repository;

import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.activitypost.query.repository.dto.ReactionCountProjection;
import com.project.jarihana.activitypost.query.repository.dto.ReactorProjection;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ActivityPostReactionQueryRepository extends JpaRepository<ActivityPostReaction, Long> {

    @Query("""
            select new com.project.jarihana.activitypost.query.repository.dto.ReactionCountProjection(
                reaction.post.id,
                reaction.emoji,
                count(reaction.id),
                sum(case when reaction.member.id = :memberId then 1 else 0 end)
            )
            from ActivityPostReaction reaction
            where reaction.post.id in :postIds
            group by reaction.post.id, reaction.emoji
            """)
    List<ReactionCountProjection> countByPostIds(
            @Param("postIds") Collection<Long> postIds,
            @Param("memberId") Long memberId
    );

    @Query("""
            select new com.project.jarihana.activitypost.query.repository.dto.ReactorProjection(
                member.id,
                member.crewName
            )
            from ActivityPostReaction reaction
            join reaction.member member
            where reaction.post.id = :postId
              and reaction.emoji = :emoji
            order by reaction.createdAt asc, reaction.id asc
            """)
    List<ReactorProjection> findReactors(
            @Param("postId") long postId,
            @Param("emoji") ReactionEmoji emoji,
            Pageable pageable
    );

    long countByPostIdAndEmoji(long postId, ReactionEmoji emoji);
}

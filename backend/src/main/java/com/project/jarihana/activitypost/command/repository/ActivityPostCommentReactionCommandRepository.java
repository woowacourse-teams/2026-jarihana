package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostCommentReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface ActivityPostCommentReactionCommandRepository
        extends JpaRepository<ActivityPostCommentReaction, Long> {

    Optional<ActivityPostCommentReaction> findByCommentIdAndMemberIdAndEmoji(
            long commentId,
            long memberId,
            ReactionEmoji emoji
    );

    /**
     * 같은 회원이 같은 댓글에 같은 이모지를 이미 남겼으면 넣지 않고 비어 있는 값을 돌려준다.
     * 다른 요청이 같은 반응을 넣고 아직 커밋하지 않았다면 DB가 그 결과를 기다린 뒤 판단하므로,
     * 요청이 동시에 들어와도 유니크 제약 예외 없이 한 건만 남는다.
     */
    default Optional<ActivityPostCommentReaction> saveIfAbsent(ActivityPostCommentReaction reaction) {
        return insertIfAbsentReturning(
                reaction.getComment().getId(),
                reaction.getMember().getId(),
                reaction.getEmoji().name(),
                reaction.getCreatedAt()
        );
    }

    @Transactional(propagation = Propagation.MANDATORY)
    @Query(value = """
            insert into activity_post_comment_reaction
                (activity_post_comment_id, member_id, emoji, created_at, updated_at)
            values (:commentId, :memberId, :emoji, :now, :now)
            on conflict (activity_post_comment_id, member_id, emoji) do nothing
            returning id, activity_post_comment_id, member_id, emoji, created_at, updated_at
            """, nativeQuery = true)
    Optional<ActivityPostCommentReaction> insertIfAbsentReturning(
            @Param("commentId") long commentId,
            @Param("memberId") long memberId,
            @Param("emoji") String emoji,
            @Param("now") LocalDateTime now
    );
}

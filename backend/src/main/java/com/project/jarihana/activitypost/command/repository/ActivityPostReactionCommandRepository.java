package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface ActivityPostReactionCommandRepository extends JpaRepository<ActivityPostReaction, Long> {

    Optional<ActivityPostReaction> findByPostIdAndMemberIdAndEmoji(long postId, long memberId, ReactionEmoji emoji);

    /**
     * 같은 회원이 같은 기록에 같은 이모지를 이미 남겼으면 넣지 않고 비어 있는 값을 돌려준다.
     * 다른 요청이 같은 반응을 넣고 아직 커밋하지 않았다면 DB가 그 결과를 기다린 뒤 판단하므로,
     * 요청이 동시에 들어와도 유니크 제약 예외 없이 한 건만 남는다.
     */
    default Optional<ActivityPostReaction> saveIfAbsent(ActivityPostReaction reaction) {
        return insertIfAbsentReturning(
                reaction.getPost().getId(),
                reaction.getMember().getId(),
                reaction.getEmoji().name(),
                reaction.getCreatedAt()
        );
    }

    @Transactional(propagation = Propagation.MANDATORY)
    @Query(value = """
            insert into activity_post_reaction (activity_post_id, member_id, emoji, created_at, updated_at)
            values (:postId, :memberId, :emoji, :now, :now)
            on conflict (activity_post_id, member_id, emoji) do nothing
            returning id, activity_post_id, member_id, emoji, created_at, updated_at
            """, nativeQuery = true)
    Optional<ActivityPostReaction> insertIfAbsentReturning(
            @Param("postId") long postId,
            @Param("memberId") long memberId,
            @Param("emoji") String emoji,
            @Param("now") LocalDateTime now
    );
}

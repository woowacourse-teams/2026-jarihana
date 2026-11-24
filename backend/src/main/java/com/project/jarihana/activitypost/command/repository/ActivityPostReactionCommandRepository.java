package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

public interface ActivityPostReactionCommandRepository extends JpaRepository<ActivityPostReaction, Long> {

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

    /**
     * 같은 회원이 같은 기록에 남긴 같은 이모지를 지운다. 지울 반응이 없으면 아무것도 하지 않는다.
     * 엔티티를 읽은 뒤 지우면 거의 동시에 온 두 요청 중 늦은 쪽의 DELETE가 0행이 되어 낙관적 잠금 예외로 끝난다.
     * 조건으로 바로 지우면 늦은 쪽은 먼저 온 요청의 커밋을 기다린 뒤 0행을 지우고 정상 종료한다.
     */
    @Modifying
    @Query("""
            delete from ActivityPostReaction r
             where r.post.id = :postId and r.member.id = :memberId and r.emoji = :emoji
            """)
    void removeByPostIdAndMemberIdAndEmoji(
            @Param("postId") long postId,
            @Param("memberId") long memberId,
            @Param("emoji") ReactionEmoji emoji
    );
}

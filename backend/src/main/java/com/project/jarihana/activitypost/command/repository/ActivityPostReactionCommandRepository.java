package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ActivityPostReactionCommandRepository extends JpaRepository<ActivityPostReaction, Long> {

    boolean existsByPostIdAndMemberIdAndEmoji(long postId, long memberId, ReactionEmoji emoji);

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

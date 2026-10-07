package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostCommentReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityPostCommentReactionCommandRepository
        extends JpaRepository<ActivityPostCommentReaction, Long> {

    boolean existsByCommentIdAndMemberIdAndEmoji(long commentId, long memberId, ReactionEmoji emoji);

    Optional<ActivityPostCommentReaction> findByCommentIdAndMemberIdAndEmoji(
            long commentId,
            long memberId,
            ReactionEmoji emoji
    );
}

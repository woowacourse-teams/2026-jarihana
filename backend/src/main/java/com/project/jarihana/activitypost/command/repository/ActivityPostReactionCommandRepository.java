package com.project.jarihana.activitypost.command.repository;

import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ActivityPostReactionCommandRepository extends JpaRepository<ActivityPostReaction, Long> {

    boolean existsByPostIdAndMemberIdAndEmoji(long postId, long memberId, ReactionEmoji emoji);

    Optional<ActivityPostReaction> findByPostIdAndMemberIdAndEmoji(long postId, long memberId, ReactionEmoji emoji);
}

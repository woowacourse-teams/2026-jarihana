package com.project.jarihana.activitypost.domain.event;

import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import java.time.LocalDateTime;

public record ActivityPostReactedEvent(long reactionId, long activityPostId, long groupId, long postAuthorMemberId,
                                       long reactorMemberId, ReactionEmoji emoji, LocalDateTime occurredAt) {

    public ActivityPostReactedEvent {
        if (reactionId <= 0 || activityPostId <= 0 || groupId <= 0 || postAuthorMemberId <= 0
                || reactorMemberId <= 0 || emoji == null || occurredAt == null) {
            throw new IllegalArgumentException("활동 기록 반응 사건의 식별자, 이모지와 시각이 필요합니다.");
        }
    }

    public static ActivityPostReactedEvent from(ActivityPostReaction reaction) {
        ActivityPost post = reaction.getPost();
        return new ActivityPostReactedEvent(reaction.getId(), post.getId(), post.getGroup().getId(),
                post.getAuthor().getId(), reaction.getMember().getId(), reaction.getEmoji(), reaction.getCreatedAt());
    }
}

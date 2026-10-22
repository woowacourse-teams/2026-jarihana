package com.project.jarihana.activitypost.domain.event;

import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostComment;
import java.time.LocalDateTime;

public record ActivityPostCommentedEvent(long commentId, long activityPostId, long groupId, long postAuthorMemberId,
                                         long commenterMemberId, LocalDateTime occurredAt) {

    public ActivityPostCommentedEvent {
        if (commentId <= 0 || activityPostId <= 0 || groupId <= 0 || postAuthorMemberId <= 0
                || commenterMemberId <= 0 || occurredAt == null) {
            throw new IllegalArgumentException("활동 기록 댓글 사건의 식별자와 시각이 필요합니다.");
        }
    }

    public static ActivityPostCommentedEvent from(ActivityPostComment comment) {
        ActivityPost post = comment.getPost();
        return new ActivityPostCommentedEvent(comment.getId(), post.getId(), post.getGroup().getId(),
                post.getAuthor().getId(), comment.getAuthor().getId(), comment.getCreatedAt());
    }
}

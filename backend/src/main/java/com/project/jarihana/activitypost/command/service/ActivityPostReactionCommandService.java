package com.project.jarihana.activitypost.command.service;

import com.project.jarihana.activitypost.command.repository.ActivityPostCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostCommentCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostCommentReactionCommandRepository;
import com.project.jarihana.activitypost.command.repository.ActivityPostReactionCommandRepository;
import com.project.jarihana.activitypost.domain.ActivityPost;
import com.project.jarihana.activitypost.domain.ActivityPostComment;
import com.project.jarihana.activitypost.domain.ActivityPostCommentReaction;
import com.project.jarihana.activitypost.domain.ActivityPostReaction;
import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 같은 회원이 같은 대상에 같은 이모지를 두 번 남기지 않는다. 추가와 취소는 모두 멱등이다.
 */
@Service
@RequiredArgsConstructor
public class ActivityPostReactionCommandService {

    private final ActivityPostCommandRepository activityPostCommandRepository;
    private final ActivityPostCommentCommandRepository activityPostCommentCommandRepository;
    private final ActivityPostReactionCommandRepository activityPostReactionCommandRepository;
    private final ActivityPostCommentReactionCommandRepository activityPostCommentReactionCommandRepository;
    private final MemberRepository memberRepository;
    private final Clock clock;

    @Transactional
    public void addToPost(long memberId, long postId, ReactionEmoji emoji) {
        ActivityPost post = getActivePost(postId);
        if (activityPostReactionCommandRepository.existsByPostIdAndMemberIdAndEmoji(postId, memberId, emoji)) {
            return;
        }
        activityPostReactionCommandRepository.save(
                ActivityPostReaction.create(post, getMember(memberId), emoji, LocalDateTime.now(clock))
        );
    }

    @Transactional
    public void removeFromPost(long memberId, long postId, ReactionEmoji emoji) {
        getActivePost(postId);
        activityPostReactionCommandRepository.findByPostIdAndMemberIdAndEmoji(postId, memberId, emoji)
                .ifPresent(activityPostReactionCommandRepository::delete);
    }

    @Transactional
    public void addToComment(long memberId, long commentId, ReactionEmoji emoji) {
        ActivityPostComment comment = getActiveComment(commentId);
        if (activityPostCommentReactionCommandRepository.existsByCommentIdAndMemberIdAndEmoji(
                commentId,
                memberId,
                emoji
        )) {
            return;
        }
        activityPostCommentReactionCommandRepository.save(
                ActivityPostCommentReaction.create(comment, getMember(memberId), emoji, LocalDateTime.now(clock))
        );
    }

    @Transactional
    public void removeFromComment(long memberId, long commentId, ReactionEmoji emoji) {
        getActiveComment(commentId);
        activityPostCommentReactionCommandRepository.findByCommentIdAndMemberIdAndEmoji(commentId, memberId, emoji)
                .ifPresent(activityPostCommentReactionCommandRepository::delete);
    }

    private ActivityPost getActivePost(long postId) {
        return activityPostCommandRepository.findByIdAndDeletedAtIsNull(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, "활동 기록을 찾을 수 없습니다."));
    }

    private ActivityPostComment getActiveComment(long commentId) {
        return activityPostCommentCommandRepository.findByIdAndDeletedAtIsNullAndPostDeletedAtIsNull(commentId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.ACTIVITY_POST_COMMENT_NOT_FOUND,
                        "댓글을 찾을 수 없습니다."
                ));
    }

    private Member getMember(long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 찾을 수 없습니다."));
    }
}

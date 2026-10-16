package com.project.jarihana.activitypost.query.service;

import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.dto.ReactorProjection;
import com.project.jarihana.activitypost.query.service.dto.ActivityReactorListResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 반응 버튼에 올렸을 때 보여 줄, 반응을 남긴 회원을 먼저 남긴 순서로 조회한다.
 * 화면은 이름 몇 개와 나머지 수만 보여 주므로 이름은 최대 {@value #MAX_REACTORS}명까지만 담는다.
 */
@Service
@RequiredArgsConstructor
public class ActivityPostReactorQueryService {

    private static final int MAX_REACTORS = 20;

    private final ActivityPostQueryRepository activityPostQueryRepository;
    private final ActivityPostCommentQueryRepository activityPostCommentQueryRepository;
    private final ActivityPostReactionQueryRepository activityPostReactionQueryRepository;
    private final ActivityPostCommentReactionQueryRepository activityPostCommentReactionQueryRepository;

    public ActivityReactorListResult findForPost(long postId, ReactionEmoji emoji, Long memberId) {
        if (!activityPostQueryRepository.existsByIdAndDeletedAtIsNull(postId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, "활동 기록을 찾을 수 없습니다.");
        }
        return toResult(
                emoji,
                activityPostReactionQueryRepository.countByPostIdAndEmoji(postId, emoji),
                activityPostReactionQueryRepository.findReactors(postId, emoji, Pageable.ofSize(MAX_REACTORS)),
                memberId
        );
    }

    public ActivityReactorListResult findForComment(long commentId, ReactionEmoji emoji, Long memberId) {
        if (!activityPostCommentQueryRepository.existsByIdAndDeletedAtIsNullAndPostDeletedAtIsNull(commentId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_POST_COMMENT_NOT_FOUND, "댓글을 찾을 수 없습니다.");
        }
        return toResult(
                emoji,
                activityPostCommentReactionQueryRepository.countByCommentIdAndEmoji(commentId, emoji),
                activityPostCommentReactionQueryRepository.findReactors(commentId, emoji, Pageable.ofSize(MAX_REACTORS)),
                memberId
        );
    }

    private static ActivityReactorListResult toResult(
            ReactionEmoji emoji,
            long count,
            List<ReactorProjection> reactors,
            Long memberId
    ) {
        return new ActivityReactorListResult(
                emoji.name(),
                count,
                reactors.stream()
                        .map(reactor -> new ActivityReactorListResult.Reactor(
                                reactor.crewName(),
                                Objects.equals(reactor.memberId(), memberId)
                        ))
                        .toList()
        );
    }
}

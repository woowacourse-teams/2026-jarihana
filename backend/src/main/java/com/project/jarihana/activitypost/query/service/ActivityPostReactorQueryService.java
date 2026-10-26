package com.project.jarihana.activitypost.query.service;

import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.dto.ReactorProjection;
import com.project.jarihana.activitypost.query.service.dto.ActivityReactorListQuery;
import com.project.jarihana.activitypost.query.service.dto.ActivityReactorListResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.common.github.GithubAvatarUrl;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 반응을 남긴 회원을 먼저 남긴 순서로 커서 조회한다. 화면은 말풍선과 요약에 첫 페이지를 쓰고,
 * 전체 목록은 아래로 내릴 때마다 다음 페이지를 이어 불러온다.
 */
@Service
@RequiredArgsConstructor
public class ActivityPostReactorQueryService {

    private static final int MAX_SIZE = 100;

    private final ActivityPostQueryRepository activityPostQueryRepository;
    private final ActivityPostCommentQueryRepository activityPostCommentQueryRepository;
    private final ActivityPostReactionQueryRepository activityPostReactionQueryRepository;
    private final ActivityPostCommentReactionQueryRepository activityPostCommentReactionQueryRepository;

    public ActivityReactorListResult findForPost(
            long postId,
            ReactionEmoji emoji,
            ActivityReactorListQuery query,
            Long memberId
    ) {
        validate(query);
        if (!activityPostQueryRepository.existsByIdAndDeletedAtIsNull(postId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, "활동 기록을 찾을 수 없습니다.");
        }
        Cursor cursor = decodeCursor(query.cursor());
        return toResult(
                emoji,
                activityPostReactionQueryRepository.countByPostIdAndEmoji(postId, emoji),
                activityPostReactionQueryRepository.findReactors(
                        postId,
                        emoji,
                        cursor == null ? null : cursor.reactedAt(),
                        cursor == null ? null : cursor.id(),
                        Pageable.ofSize(query.size() + 1)
                ),
                query.size(),
                memberId
        );
    }

    public ActivityReactorListResult findForComment(
            long commentId,
            ReactionEmoji emoji,
            ActivityReactorListQuery query,
            Long memberId
    ) {
        validate(query);
        if (!activityPostCommentQueryRepository.existsByIdAndDeletedAtIsNullAndPostDeletedAtIsNull(commentId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_POST_COMMENT_NOT_FOUND, "댓글을 찾을 수 없습니다.");
        }
        Cursor cursor = decodeCursor(query.cursor());
        return toResult(
                emoji,
                activityPostCommentReactionQueryRepository.countByCommentIdAndEmoji(commentId, emoji),
                activityPostCommentReactionQueryRepository.findReactors(
                        commentId,
                        emoji,
                        cursor == null ? null : cursor.reactedAt(),
                        cursor == null ? null : cursor.id(),
                        Pageable.ofSize(query.size() + 1)
                ),
                query.size(),
                memberId
        );
    }

    private static void validate(ActivityReactorListQuery query) {
        if (query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
    }

    private static ActivityReactorListResult toResult(
            ReactionEmoji emoji,
            long count,
            List<ReactorProjection> candidates,
            int size,
            Long memberId
    ) {
        boolean hasNext = candidates.size() > size;
        List<ReactorProjection> page = hasNext ? candidates.subList(0, size) : candidates;
        return new ActivityReactorListResult(
                emoji.name(),
                count,
                page.stream()
                        .map(reactor -> new ActivityReactorListResult.Reactor(
                                reactor.crewName(),
                                GithubAvatarUrl.from(reactor.githubId()),
                                reactor.memberType().name(),
                                reactor.generation(),
                                reactor.course() == null ? null : reactor.course().name(),
                                Objects.equals(reactor.memberId(), memberId)
                        ))
                        .toList(),
                hasNext ? encodeCursor(page.get(page.size() - 1)) : null,
                hasNext
        );
    }

    private static String encodeCursor(ReactorProjection reactor) {
        String value = reactor.reactedAt() + "|" + reactor.reactionId();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Cursor decodeCursor(String cursor) {
        if (cursor == null) {
            return null;
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            String[] values = decoded.split("\\|", -1);
            if (values.length != 2) {
                throw invalidParameter();
            }
            long id = Long.parseLong(values[1]);
            if (id < 1) {
                throw invalidParameter();
            }
            return new Cursor(LocalDateTime.parse(values[0]), id);
        } catch (IllegalArgumentException | DateTimeParseException exception) {
            throw invalidParameter();
        }
    }

    private static BusinessException invalidParameter() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "요청 파라미터가 올바르지 않습니다.");
    }

    private record Cursor(LocalDateTime reactedAt, long id) {
    }
}

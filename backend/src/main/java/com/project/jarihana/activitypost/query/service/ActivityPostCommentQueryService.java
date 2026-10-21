package com.project.jarihana.activitypost.query.service;

import com.project.jarihana.activitypost.query.repository.ActivityPostCommentQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostCommentReactionQueryRepository;
import com.project.jarihana.activitypost.query.repository.ActivityPostQueryRepository;
import com.project.jarihana.activitypost.query.repository.dto.ActivityPostCommentProjection;
import com.project.jarihana.activitypost.query.service.dto.ActivityPostCommentListQuery;
import com.project.jarihana.activitypost.query.service.dto.ActivityPostCommentListResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

/**
 * 댓글은 대화를 읽는 순서대로 작성 시각 오름차순으로 조회한다.
 */
@Service
@RequiredArgsConstructor
public class ActivityPostCommentQueryService {

    private static final int MAX_SIZE = 100;

    private final ActivityPostQueryRepository activityPostQueryRepository;
    private final ActivityPostCommentQueryRepository activityPostCommentQueryRepository;
    private final ActivityPostCommentReactionQueryRepository activityPostCommentReactionQueryRepository;

    public ActivityPostCommentListResult find(long postId, ActivityPostCommentListQuery query, Long memberId) {
        if (query == null || query.size() < 1 || query.size() > MAX_SIZE) {
            throw invalidParameter();
        }
        if (!activityPostQueryRepository.existsByIdAndDeletedAtIsNull(postId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_POST_NOT_FOUND, "활동 기록을 찾을 수 없습니다.");
        }

        Cursor cursor = decodeCursor(query.cursor());
        List<ActivityPostCommentProjection> candidates = activityPostCommentQueryRepository.findPage(
                postId,
                memberId,
                cursor == null ? null : cursor.createdAt(),
                cursor == null ? null : cursor.id(),
                Pageable.ofSize(query.size() + 1)
        );
        boolean hasNext = candidates.size() > query.size();
        List<ActivityPostCommentProjection> page = hasNext ? candidates.subList(0, query.size()) : candidates;
        String nextCursor = hasNext ? encodeCursor(page.get(page.size() - 1)) : null;
        ReactionSummaries reactions = findReactions(page, memberId);
        return new ActivityPostCommentListResult(
                page.stream().map(comment -> new ActivityPostCommentListResult.Item(
                        comment.id(),
                        comment.authorNickname(),
                        comment.content(),
                        comment.createdAt(),
                        comment.canDelete(),
                        reactions.of(comment.id())
                )).toList(),
                nextCursor,
                hasNext
        );
    }

    private ReactionSummaries findReactions(List<ActivityPostCommentProjection> page, Long memberId) {
        if (page.isEmpty()) {
            return ReactionSummaries.from(List.of());
        }
        List<Long> commentIds = page.stream().map(ActivityPostCommentProjection::id).toList();
        return ReactionSummaries.from(
                activityPostCommentReactionQueryRepository.countByCommentIds(commentIds, memberId)
        );
    }

    private static String encodeCursor(ActivityPostCommentProjection comment) {
        String value = comment.createdAt() + "|" + comment.id();
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

    private record Cursor(LocalDateTime createdAt, long id) {
    }
}

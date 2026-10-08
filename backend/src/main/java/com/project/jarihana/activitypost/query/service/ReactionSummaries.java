package com.project.jarihana.activitypost.query.service;

import com.project.jarihana.activitypost.query.repository.dto.ReactionCountProjection;
import com.project.jarihana.activitypost.query.service.dto.ActivityReactionResult;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 대상별 반응 집계를 응답 순서(이모지 선언 순서)로 묶는다. 반응이 없는 대상은 빈 목록이다.
 */
final class ReactionSummaries {

    private final Map<Long, List<ActivityReactionResult>> reactionsByTargetId;

    private ReactionSummaries(Map<Long, List<ActivityReactionResult>> reactionsByTargetId) {
        this.reactionsByTargetId = reactionsByTargetId;
    }

    static ReactionSummaries from(List<ReactionCountProjection> counts) {
        return new ReactionSummaries(counts.stream()
                .sorted(Comparator.comparing(ReactionCountProjection::emoji))
                .collect(Collectors.groupingBy(
                        ReactionCountProjection::targetId,
                        Collectors.mapping(ReactionSummaries::toResult, Collectors.toList())
                )));
    }

    List<ActivityReactionResult> of(Long targetId) {
        return reactionsByTargetId.getOrDefault(targetId, List.of());
    }

    private static ActivityReactionResult toResult(ReactionCountProjection count) {
        return new ActivityReactionResult(count.emoji().name(), count.count(), count.reactedCount() > 0);
    }
}

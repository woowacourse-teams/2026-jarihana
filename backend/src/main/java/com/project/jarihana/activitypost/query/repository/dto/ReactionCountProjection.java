package com.project.jarihana.activitypost.query.repository.dto;

import com.project.jarihana.activitypost.domain.ReactionEmoji;

/**
 * 반응 대상(기록 또는 댓글) 하나의 이모지별 개수와 요청자가 남긴 수(0 또는 1)다.
 */
public record ReactionCountProjection(Long targetId, ReactionEmoji emoji, Long count, Long reactedCount) {
}

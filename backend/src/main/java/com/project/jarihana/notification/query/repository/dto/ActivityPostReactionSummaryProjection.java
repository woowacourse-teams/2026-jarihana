package com.project.jarihana.notification.query.repository.dto;

/**
 * 기록 작성자 본인을 뺀 좋아요 수와 가장 최근에 누른 회원 이름이다.
 */
public record ActivityPostReactionSummaryProjection(long activityPostId, String latestReactorName, long reactorCount) {
}

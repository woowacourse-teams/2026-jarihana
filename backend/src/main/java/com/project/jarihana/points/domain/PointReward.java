package com.project.jarihana.points.domain;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

public record PointReward(
        long memberId,
        PointRewardRule rule,
        String sourceKey,
        String scopeKey,
        LocalDateTime occurredAt,
        long amount,
        SkipReason ineligibleReason
) {
    public PointReward {
        Objects.requireNonNull(rule);
        if (memberId < 1 || amount < 1 || amount > PointRewardRule.MAX_AMOUNT) {
            throw new IllegalArgumentException("포인트 적립 대상과 지급액이 올바르지 않습니다.");
        }
        validateKey(sourceKey);
        if (rule.duplicateScopeReason() != null) {
            validateKey(scopeKey);
        } else if (scopeKey != null) {
            throw new IllegalArgumentException("중복 범위를 정의한 포인트 규칙에만 범위 키를 지정할 수 있습니다.");
        }
        occurredAt = occurredAt.truncatedTo(ChronoUnit.MICROS);
    }

    public static PointReward of(PointRewardRule rule, long memberId, String sourceKey, LocalDateTime occurredAt) {
        return of(rule, memberId, sourceKey, null, occurredAt, null);
    }

    public static PointReward of(PointRewardRule rule, long memberId, String sourceKey, String scopeKey,
                                 LocalDateTime occurredAt, SkipReason ineligibleReason) {
        return new PointReward(memberId, rule, sourceKey, scopeKey, occurredAt, rule.defaultAmount(), ineligibleReason);
    }

    private static void validateKey(String key) {
        if (key == null || key.isBlank() || key.length() > 80) {
            throw new IllegalArgumentException("포인트 적립 키는 비어 있지 않은 최대 80자의 문자열이어야 합니다.");
        }
    }

    public enum SkipReason {
        ALREADY_REWARDED, WEEKLY_LIMIT, SAME_ACTIVITY_DATE, TOO_FEW_MOVES, INELIGIBLE
    }
}

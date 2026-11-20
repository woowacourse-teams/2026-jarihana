package com.project.jarihana.points.domain;

import com.project.jarihana.points.domain.PointReward.SkipReason;

public record PointRewardRule(
        String code,
        String label,
        long defaultAmount,
        boolean oncePerMember,
        int weeklyLimit,
        SkipReason duplicateScopeReason
) {
    static final long MAX_AMOUNT = 9_007_199_254_740_991L;

    public PointRewardRule {
        if (code == null || !code.matches("[A-Z][A-Z0-9_]{0,29}")) {
            throw new IllegalArgumentException("포인트 적립 사유 코드는 영문 대문자로 시작해야 하며 최대 30자입니다.");
        }
        if (label == null || label.isBlank() || defaultAmount < 1 || defaultAmount > MAX_AMOUNT) {
            throw new IllegalArgumentException("포인트 적립 규칙에는 표시 이름과 유효한 금액이 필요합니다.");
        }
        if (weeklyLimit < 0 || (oncePerMember && (weeklyLimit > 0 || duplicateScopeReason != null))) {
            throw new IllegalArgumentException("포인트 적립 한도 조합이 올바르지 않습니다.");
        }
    }

    public static PointRewardRule once(String code, String label, long amount) {
        return new PointRewardRule(code, label, amount, true, 0, null);
    }

    public static PointRewardRule weekly(String code, String label, long amount, int limit) {
        if (limit < 1) {
            throw new IllegalArgumentException("주간 적립 한도는 한 번 이상이어야 합니다.");
        }
        return new PointRewardRule(code, label, amount, false, limit, null);
    }
}

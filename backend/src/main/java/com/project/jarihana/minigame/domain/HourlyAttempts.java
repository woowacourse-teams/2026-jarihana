package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

/**
 * 순위 도전 횟수 규칙이다. 매시 정각에 정해진 횟수로 다시 채우고, 남은 횟수는 다음 시간으로 넘기지 않는다.
 * 시작한 판은 끝내지 않아도 그 시간의 횟수에 들어간다.
 */
public final class HourlyAttempts {

    private final int limit;

    private HourlyAttempts(int limit) {
        if (limit <= 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "한 시간 도전 횟수는 1번 이상이어야 합니다.");
        }
        this.limit = limit;
    }

    public static HourlyAttempts of(int limit) {
        return new HourlyAttempts(limit);
    }

    /**
     * 지금 시각이 속한 시간 칸의 시작이다. 이 시각부터 시작한 판을 센다.
     */
    public LocalDateTime windowStart(LocalDateTime now) {
        return now.truncatedTo(ChronoUnit.HOURS);
    }

    public LocalDateTime nextRefillAt(LocalDateTime now) {
        return windowStart(now).plusHours(1);
    }

    public int remaining(long used) {
        return (int) Math.max(0, limit - used);
    }

    public boolean exhausted(long used) {
        return used >= limit;
    }

    public int limit() {
        return limit;
    }
}

package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.time.LocalDateTime;

/**
 * 이벤트를 화면에 보여 주는 기간이다. 여는 시각은 포함하고 닫는 시각은 포함하지 않는다.
 * 항상 열기로 하면 개발 환경처럼 기간과 관계없이 진행 중으로 본다.
 */
public final class EventSchedule {

    private final LocalDateTime opensAt;
    private final LocalDateTime closesAt;
    private final boolean alwaysOpen;

    private EventSchedule(LocalDateTime opensAt, LocalDateTime closesAt, boolean alwaysOpen) {
        if (opensAt == null || closesAt == null || !opensAt.isBefore(closesAt)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이벤트 닫는 시각은 여는 시각보다 늦어야 합니다.");
        }
        this.opensAt = opensAt;
        this.closesAt = closesAt;
        this.alwaysOpen = alwaysOpen;
    }

    public static EventSchedule of(LocalDateTime opensAt, LocalDateTime closesAt, boolean alwaysOpen) {
        return new EventSchedule(opensAt, closesAt, alwaysOpen);
    }

    public EventStatus statusAt(LocalDateTime now) {
        if (alwaysOpen) {
            return EventStatus.OPEN;
        }
        if (now.isBefore(opensAt)) {
            return EventStatus.UPCOMING;
        }
        if (now.isBefore(closesAt)) {
            return EventStatus.OPEN;
        }
        return EventStatus.CLOSED;
    }

    public LocalDateTime opensAt() {
        return opensAt;
    }

    public LocalDateTime closesAt() {
        return closesAt;
    }

    public boolean alwaysOpen() {
        return alwaysOpen;
    }
}

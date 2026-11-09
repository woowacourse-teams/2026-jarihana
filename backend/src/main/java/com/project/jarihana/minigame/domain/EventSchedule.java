package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.time.LocalDateTime;

/**
 * 이벤트를 화면에 보여 주는 기간과, 끝난 뒤 게임방으로 옮겨 가는 시각이다. 여는 시각은 포함하고 닫는 시각은 포함하지 않는다.
 * 항상 열기로 하면 개발 환경처럼 기간과 관계없이 진행 중으로 보고, 게임방에도 바로 보인다.
 */
public final class EventSchedule {

    private final LocalDateTime opensAt;
    private final LocalDateTime closesAt;
    private final LocalDateTime gameRoomOpensAt;
    private final boolean alwaysOpen;

    private EventSchedule(LocalDateTime opensAt, LocalDateTime closesAt, LocalDateTime gameRoomOpensAt, boolean alwaysOpen) {
        if (opensAt == null || closesAt == null || !opensAt.isBefore(closesAt)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이벤트 닫는 시각은 여는 시각보다 늦어야 합니다.");
        }
        if (gameRoomOpensAt == null || gameRoomOpensAt.isBefore(closesAt)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "게임방으로 옮기는 시각은 이벤트가 닫힌 뒤여야 합니다.");
        }
        this.opensAt = opensAt;
        this.closesAt = closesAt;
        this.gameRoomOpensAt = gameRoomOpensAt;
        this.alwaysOpen = alwaysOpen;
    }

    public static EventSchedule of(
            LocalDateTime opensAt,
            LocalDateTime closesAt,
            LocalDateTime gameRoomOpensAt,
            boolean alwaysOpen
    ) {
        return new EventSchedule(opensAt, closesAt, gameRoomOpensAt, alwaysOpen);
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

    /**
     * 게임방에서 연습으로 할 수 있는지다. 옮기는 시각부터 계속 열려 있다.
     */
    public boolean inGameRoomAt(LocalDateTime now) {
        return alwaysOpen || !now.isBefore(gameRoomOpensAt);
    }

    public LocalDateTime opensAt() {
        return opensAt;
    }

    public LocalDateTime closesAt() {
        return closesAt;
    }

    public LocalDateTime gameRoomOpensAt() {
        return gameRoomOpensAt;
    }

    public boolean alwaysOpen() {
        return alwaysOpen;
    }
}

package com.project.jarihana.minigame.query.service.dto;

import com.project.jarihana.minigame.domain.EventStatus;
import java.time.LocalDateTime;

/**
 * 이벤트 기간, 게임방으로 옮기는 시각, 서버 시각과 한 시간 도전 횟수다. 남은 횟수는 로그인 회원에게만 있다.
 */
public record EventStatusResult(
        EventStatus status,
        LocalDateTime opensAt,
        LocalDateTime closesAt,
        LocalDateTime gameRoomOpensAt,
        boolean gameRoomOpen,
        LocalDateTime serverTime,
        int hourlyAttemptLimit,
        Integer remainingAttempts,
        LocalDateTime attemptsRefillAt
) {
}

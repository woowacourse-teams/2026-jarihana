package com.project.jarihana.minigame.query.service.dto;

import com.project.jarihana.minigame.domain.EventStatus;
import java.time.LocalDateTime;

/**
 * 남은 도전 횟수는 로그인 회원에게만 있다. 게임방에 들어간 뒤에도 연습은 계속할 수 있다.
 */
public record EventStatusResult(
        EventStatus status,
        LocalDateTime opensAt,
        LocalDateTime closesAt,
        LocalDateTime gameRoomOpensAt,
        boolean gameRoomOpen,
        LocalDateTime serverTime,
        int dailyAttemptLimit,
        Integer remainingAttempts
) {
}

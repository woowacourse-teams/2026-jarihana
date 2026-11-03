package com.project.jarihana.minigame.query.service.dto;

import com.project.jarihana.minigame.domain.EventStatus;
import java.time.LocalDateTime;

/**
 * 남은 도전 횟수는 로그인 회원에게만 있다.
 */
public record EventStatusResult(
        EventStatus status,
        LocalDateTime opensAt,
        LocalDateTime closesAt,
        LocalDateTime serverTime,
        int dailyAttemptLimit,
        Integer remainingAttempts
) {
}

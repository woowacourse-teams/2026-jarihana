package com.project.jarihana.minigame.query.controller.dto;

import com.project.jarihana.minigame.query.service.dto.EventStatusResult;
import java.time.LocalDateTime;

public record EventStatusResponse(
        String status,
        LocalDateTime opensAt,
        LocalDateTime closesAt,
        LocalDateTime serverTime,
        int dailyAttemptLimit,
        Integer remainingAttempts
) {

    public static EventStatusResponse from(EventStatusResult result) {
        return new EventStatusResponse(
                result.status().name(),
                result.opensAt(),
                result.closesAt(),
                result.serverTime(),
                result.dailyAttemptLimit(),
                result.remainingAttempts()
        );
    }
}

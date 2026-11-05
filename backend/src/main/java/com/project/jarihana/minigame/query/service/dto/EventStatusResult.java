package com.project.jarihana.minigame.query.service.dto;

import com.project.jarihana.minigame.domain.EventStatus;
import java.time.LocalDateTime;

/**
 * 이벤트 기간, 게임방으로 옮기는 시각과 서버 시각이다. 순위 도전 횟수에는 제한이 없다.
 */
public record EventStatusResult(
        EventStatus status,
        LocalDateTime opensAt,
        LocalDateTime closesAt,
        LocalDateTime gameRoomOpensAt,
        boolean gameRoomOpen,
        LocalDateTime serverTime
) {
}

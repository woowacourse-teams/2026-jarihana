package com.project.jarihana.gomoku.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.project.jarihana.common.exception.BusinessException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

class GomokuRoomTest {
    private final LocalDateTime now = LocalDateTime.of(2026, 11, 2, 12, 0);

    private GomokuRoom joined() {
        return GomokuRoom.create(1, "가을", RoomVisibility.PUBLIC, GomokuRule.RENJU, now)
                .join(2, "겨울", now);
    }

    @Test
    @DisplayName("두 사람의 준비만으로는 대국이나 제한 시간이 시작되지 않는다")
    void keepsBothReadyUntilHostStarts() {
        // Given
        var room = joined();
        // When
        var ready = room.ready(1, true, now).ready(2, true, now);
        // Then
        assertEquals(RoomStatus.WAITING, ready.getStatus());
        assertEquals(0, ready.getGameNumber());
        assertTrue(ready.isHostReady());
        assertTrue(ready.isGuestReady());
        assertNull(ready.getTurnDeadline());
    }

    @Test
    @DisplayName("두 사람이 준비한 뒤 방장이 시작하며 재대국은 흑백을 바꾼다")
    void hostStartsAfterBothReadyAndSwapsColors() {
        // Given
        var waiting = joined().ready(1, true, now);
        assertEquals(RoomStatus.WAITING, waiting.getStatus());
        // When
        var playing = waiting.ready(2, true, now).start(1, 1, now);
        // Then
        assertEquals(RoomStatus.PLAYING, playing.getStatus());
        assertEquals(now.plusSeconds(60), playing.getTurnDeadline());
        var finished = playing.resign(1, now);
        var rematch = finished.ready(1, true, now).ready(2, true, now).start(1, 1, now);
        assertEquals(2, rematch.getGameNumber());
        assertEquals(2L, rematch.getBlackMemberId());
        assertEquals(0, rematch.getPly());
    }

    @Test
    @DisplayName("60초 경계에서는 착수를 거부하고 시간패로 끝낸다")
    void expiresAtDeadline() {
        // Given
        var playing = joined().ready(1, true, now).ready(2, true, now).start(1, 1, now);
        // When / Then
        assertThrows(
                BusinessException.class, () -> playing.move(1, 1, 0, 7, 7, now.plusSeconds(60)));
        var expired = playing.expire(now.plusSeconds(60));
        assertEquals(RoomStatus.FINISHED, expired.getStatus());
        assertEquals(2L, expired.getWinnerMemberId());
    }

    @Test
    @DisplayName("다른 차례와 이전 판의 요청을 거부하며 원본을 보존한다")
    void rejectsWrongTurnAndStaleGame() {
        // Given
        var playing = joined().ready(1, true, now).ready(2, true, now).start(1, 1, now);
        // When / Then
        assertThrows(BusinessException.class, () -> playing.move(2, 1, 0, 7, 7, now));
        assertThrows(BusinessException.class, () -> playing.move(1, 2, 0, 7, 7, now));
        assertEquals(0, playing.getPly());
        assertEquals(1, playing.move(1, 1, 0, 7, 7, now).getPly());
    }
    @Test
    @DisplayName("방장만 두 사람의 준비가 유지된 상태에서 시작하며 시작 시각에 제한 시간을 설정한다")
    void onlyHostStartsWhileBothReady() {
        // Given
        var waiting = joined();
        var hostReady = waiting.ready(1, true, now);
        var bothReady = hostReady.ready(2, true, now);
        // When / Then
        assertThrows(BusinessException.class, () -> waiting.start(1, 1, now));
        assertThrows(BusinessException.class, () -> hostReady.start(1, 1, now));
        assertThrows(BusinessException.class, () -> bothReady.start(2, 1, now));
        assertThrows(BusinessException.class, () -> bothReady.start(3, 1, now));
        assertThrows(BusinessException.class, () -> bothReady.ready(2, false, now).start(1, 1, now));
        var playing = bothReady.start(1, 2, now.plusMinutes(5));
        assertEquals(2L, playing.getBlackMemberId());
        assertEquals(now.plusMinutes(5).plusSeconds(60), playing.getTurnDeadline());
        assertThrows(BusinessException.class, () -> playing.start(1, 1, now));
        assertThrows(BusinessException.class, () -> bothReady.leave(1, now).start(1, 1, now));
    }

}

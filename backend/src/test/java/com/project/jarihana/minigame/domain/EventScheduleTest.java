package com.project.jarihana.minigame.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class EventScheduleTest {

    private static final LocalDateTime OPENS_AT = LocalDateTime.of(2026, 11, 11, 0, 0);
    private static final LocalDateTime CLOSES_AT = LocalDateTime.of(2026, 11, 12, 10, 0);
    private static final LocalDateTime GAME_ROOM_OPENS_AT = LocalDateTime.of(2026, 11, 12, 13, 0);

    @DisplayName("여는 시각 전에는 준비 중, 여는 시각부터 닫는 시각 전까지는 진행 중, 그 뒤에는 종료다.")
    @Test
    void decidesStatusByTime() {
        // Given
        EventSchedule schedule = EventSchedule.of(OPENS_AT, CLOSES_AT, GAME_ROOM_OPENS_AT, false);

        // When & Then
        assertThat(schedule.statusAt(OPENS_AT.minusSeconds(1))).isEqualTo(EventStatus.UPCOMING);
        assertThat(schedule.statusAt(OPENS_AT)).isEqualTo(EventStatus.OPEN);
        assertThat(schedule.statusAt(CLOSES_AT.minusSeconds(1))).isEqualTo(EventStatus.OPEN);
        assertThat(schedule.statusAt(CLOSES_AT)).isEqualTo(EventStatus.CLOSED);
    }

    @DisplayName("끝난 뒤 게임방으로 옮기는 시각부터 게임방에 보이고, 그 전에는 끝난 이벤트로만 남는다.")
    @Test
    void movesToGameRoomAtGivenTime() {
        // Given
        EventSchedule schedule = EventSchedule.of(OPENS_AT, CLOSES_AT, GAME_ROOM_OPENS_AT, false);

        // When & Then
        assertThat(schedule.inGameRoomAt(OPENS_AT)).isFalse();
        assertThat(schedule.inGameRoomAt(CLOSES_AT)).isFalse();
        assertThat(schedule.inGameRoomAt(GAME_ROOM_OPENS_AT.minusSeconds(1))).isFalse();
        assertThat(schedule.inGameRoomAt(GAME_ROOM_OPENS_AT)).isTrue();
        assertThat(schedule.inGameRoomAt(GAME_ROOM_OPENS_AT.plusDays(30))).isTrue();
        assertThat(schedule.statusAt(GAME_ROOM_OPENS_AT)).isEqualTo(EventStatus.CLOSED);
    }

    @DisplayName("개발 환경처럼 항상 열도록 설정하면 시각과 관계없이 진행 중이고 게임방에도 보인다.")
    @Test
    void alwaysOpenIgnoresTime() {
        // Given
        EventSchedule schedule = EventSchedule.of(OPENS_AT, CLOSES_AT, GAME_ROOM_OPENS_AT, true);

        // When & Then
        assertThat(schedule.statusAt(OPENS_AT.minusDays(30))).isEqualTo(EventStatus.OPEN);
        assertThat(schedule.statusAt(CLOSES_AT.plusDays(30))).isEqualTo(EventStatus.OPEN);
        assertThat(schedule.inGameRoomAt(OPENS_AT.minusDays(30))).isTrue();
    }

    @DisplayName("닫는 시각이 여는 시각보다 늦지 않거나, 게임방 시각이 닫는 시각보다 이르면 만들 수 없다.")
    @Test
    void rejectsReversedWindow() {
        // When & Then
        assertThatThrownBy(() -> EventSchedule.of(CLOSES_AT, OPENS_AT, GAME_ROOM_OPENS_AT, false))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> EventSchedule.of(OPENS_AT, CLOSES_AT, CLOSES_AT.minusMinutes(1), false))
                .isInstanceOf(BusinessException.class);
    }
}

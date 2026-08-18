package com.project.jarihana.group.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SessionGroupScheduleTest {

    @DisplayName("날짜와 시작·종료 시각으로 일회성 일정을 생성한다.")
    @Test
    void createSessionSchedule() {
        // Given
        LocalDate sessionDate = LocalDate.of(2026, 8, 30);

        // When
        SessionGroupSchedule schedule = SessionGroupSchedule.of(
                sessionDate,
                LocalTime.of(14, 0),
                LocalTime.of(16, 0)
        );

        // Then
        assertThat(schedule.getSessionDate()).isEqualTo(sessionDate);
        assertThat(schedule.getStartTime()).isEqualTo(LocalTime.of(14, 0));
        assertThat(schedule.getEndTime()).isEqualTo(LocalTime.of(16, 0));
    }

    @DisplayName("일회성 일정의 날짜는 필수다.")
    @Test
    void sessionDateIsRequired() {
        // When & Then
        assertThatThrownBy(() -> SessionGroupSchedule.of(
                null,
                LocalTime.of(14, 0),
                LocalTime.of(16, 0)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("일회성 일정의 시작 시각은 종료 시각보다 빨라야 한다.")
    @Test
    void startTimeMustBeBeforeEndTime() {
        // When & Then
        assertThatThrownBy(() -> SessionGroupSchedule.of(
                LocalDate.of(2026, 8, 30),
                LocalTime.of(16, 0),
                LocalTime.of(15, 0)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("일회성 일정의 시작 시각과 종료 시각은 필수다.")
    @Test
    void timesAreRequired() {
        // When & Then
        assertThatThrownBy(() -> SessionGroupSchedule.of(
                LocalDate.of(2026, 8, 30),
                null,
                LocalTime.of(16, 0)
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> SessionGroupSchedule.of(
                LocalDate.of(2026, 8, 30),
                LocalTime.of(14, 0),
                null
        )).isInstanceOf(IllegalArgumentException.class);
    }
}

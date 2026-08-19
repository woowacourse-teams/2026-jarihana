package com.project.jarihana.group.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.EnumSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecurringGroupScheduleTest {

    @DisplayName("반복 일정은 전달받은 요일 집합의 변경에 영향받지 않는다.")
    @Test
    void copyDaysOfWeekDefensively() {
        // Given
        Set<DayOfWeek> days = EnumSet.of(DayOfWeek.MONDAY);

        // When
        RecurringGroupSchedule schedule = RecurringGroupSchedule.of(
                days,
                LocalTime.of(18, 0),
                LocalTime.of(20, 0)
        );
        days.add(DayOfWeek.TUESDAY);

        // Then
        assertThat(schedule.getActivityDays().values()).containsExactly(DayOfWeek.MONDAY);
        assertThatThrownBy(() -> schedule.getActivityDays().values().add(DayOfWeek.WEDNESDAY))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @DisplayName("반복 일정은 하나 이상의 활동 요일을 가져야 한다.")
    @Test
    void daysOfWeekCannotBeEmpty() {
        // When & Then
        assertThatThrownBy(() -> RecurringGroupSchedule.of(
                Set.of(),
                LocalTime.of(18, 0),
                LocalTime.of(20, 0)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("반복 일정의 시작 시각은 종료 시각보다 빨라야 한다.")
    @Test
    void startTimeMustBeBeforeEndTime() {
        // When & Then
        assertThatThrownBy(() -> RecurringGroupSchedule.of(
                Set.of(DayOfWeek.MONDAY),
                LocalTime.of(20, 0),
                LocalTime.of(20, 0)
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("반복 일정의 시작 시각과 종료 시각은 필수다.")
    @Test
    void timesAreRequired() {
        // When & Then
        assertThatThrownBy(() -> RecurringGroupSchedule.of(
                Set.of(DayOfWeek.MONDAY),
                null,
                LocalTime.of(20, 0)
        )).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> RecurringGroupSchedule.of(
                Set.of(DayOfWeek.MONDAY),
                LocalTime.of(18, 0),
                null
        )).isInstanceOf(IllegalArgumentException.class);
    }
}

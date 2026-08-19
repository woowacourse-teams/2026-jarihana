package com.project.jarihana.group.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.DayOfWeek;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ActivityDaysTest {

    @DisplayName("활동 요일은 하나 이상이어야 한다.")
    @Test
    void activityDaysCannotBeEmpty() {
        // When & Then
        assertThatThrownBy(() -> ActivityDays.from(Set.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ActivityDays.from(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("활동 요일에는 null이 포함될 수 없다.")
    @Test
    void activityDaysCannotContainNull() {
        // Given
        Set<DayOfWeek> daysOfWeek = new HashSet<>();
        daysOfWeek.add(DayOfWeek.MONDAY);
        daysOfWeek.add(null);

        // When & Then
        assertThatThrownBy(() -> ActivityDays.from(daysOfWeek))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("활동 요일은 전달받은 집합의 변경에 영향받지 않는다.")
    @Test
    void copyActivityDaysDefensively() {
        // Given
        Set<DayOfWeek> daysOfWeek = EnumSet.of(DayOfWeek.MONDAY);

        // When
        ActivityDays activityDays = ActivityDays.from(daysOfWeek);
        daysOfWeek.add(DayOfWeek.TUESDAY);

        // Then
        assertThat(activityDays.values()).containsExactly(DayOfWeek.MONDAY);
        assertThatThrownBy(() -> activityDays.values().add(DayOfWeek.WEDNESDAY))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @DisplayName("특정 요일이 활동 요일에 포함되는지 확인한다.")
    @Test
    void containsActivityDay() {
        // Given
        ActivityDays activityDays = ActivityDays.from(EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY));

        // When & Then
        assertThat(activityDays.contains(DayOfWeek.MONDAY)).isTrue();
        assertThat(activityDays.contains(DayOfWeek.TUESDAY)).isFalse();
        assertThat(activityDays.size()).isEqualTo(2);
    }
}

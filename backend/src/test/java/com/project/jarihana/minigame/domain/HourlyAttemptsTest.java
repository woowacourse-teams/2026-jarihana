package com.project.jarihana.minigame.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class HourlyAttemptsTest {

    @DisplayName("이번 시간 칸은 정각부터 세고, 다음 충전은 다음 정각이다.")
    @Test
    void countsFromTheTopOfTheHour() {
        // Given
        HourlyAttempts attempts = HourlyAttempts.of(10);

        // When & Then
        assertThat(attempts.windowStart(LocalDateTime.of(2026, 11, 11, 14, 59, 59)))
                .isEqualTo(LocalDateTime.of(2026, 11, 11, 14, 0));
        assertThat(attempts.windowStart(LocalDateTime.of(2026, 11, 11, 15, 0)))
                .isEqualTo(LocalDateTime.of(2026, 11, 11, 15, 0));
        assertThat(attempts.nextRefillAt(LocalDateTime.of(2026, 11, 11, 23, 30)))
                .isEqualTo(LocalDateTime.of(2026, 11, 12, 0, 0));
    }

    @DisplayName("한 시간에 정한 횟수까지 시작할 수 있고, 남은 횟수는 0보다 작아지지 않는다.")
    @Test
    void limitsStartsWithinTheHour() {
        // Given
        HourlyAttempts attempts = HourlyAttempts.of(10);

        // When & Then
        assertThat(attempts.exhausted(9)).isFalse();
        assertThat(attempts.exhausted(10)).isTrue();
        assertThat(attempts.remaining(3)).isEqualTo(7);
        assertThat(attempts.remaining(12)).isZero();
    }

    @DisplayName("한 시간 도전 횟수가 1번보다 적으면 만들 수 없다.")
    @Test
    void rejectsNonPositiveLimit() {
        // When & Then
        assertThatThrownBy(() -> HourlyAttempts.of(0)).isInstanceOf(BusinessException.class);
    }
}

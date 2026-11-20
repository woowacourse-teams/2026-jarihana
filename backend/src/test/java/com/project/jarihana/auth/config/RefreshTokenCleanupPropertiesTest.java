package com.project.jarihana.auth.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RefreshTokenCleanupPropertiesTest {

    @DisplayName("값이 없으면 여유 시간 하루, 묶음 크기 100을 쓴다.")
    @Test
    void useDefaultsWhenMissing() {
        // Given
        // When
        RefreshTokenCleanupProperties properties = new RefreshTokenCleanupProperties(null, 0);

        // Then
        assertThat(properties.gracePeriod()).isEqualTo(Duration.ofDays(1));
        assertThat(properties.batchSize()).isEqualTo(100);
    }

    @DisplayName("음수 여유 시간은 아직 쓸 수 있는 토큰을 지우게 하므로 거부한다.")
    @Test
    void rejectNegativeGracePeriod() {
        // Given
        Duration negative = Duration.ofHours(-1);

        // When
        // Then
        assertThatThrownBy(() -> new RefreshTokenCleanupProperties(negative, 100))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @DisplayName("음수 묶음 크기는 거부한다.")
    @Test
    void rejectNegativeBatchSize() {
        // Given
        int negative = -1;

        // When
        // Then
        assertThatThrownBy(() -> new RefreshTokenCleanupProperties(Duration.ofDays(1), negative))
                .isInstanceOf(IllegalArgumentException.class);
    }
}

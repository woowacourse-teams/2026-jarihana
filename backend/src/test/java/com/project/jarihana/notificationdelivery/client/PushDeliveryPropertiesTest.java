package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.notificationdelivery.config.PushDeliveryProperties;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PushDeliveryPropertiesTest {
    @Test
    @DisplayName("기본 설정은 동시 전송과 스레드 및 연결 수를 제한한다")
    void defaultsBoundConcurrencyAndConnections() {
        // Given / When
        var properties = PushDeliveryProperties.defaults();
        // Then
        assertThat(properties.maxInFlight()).isEqualTo(4);
        assertThat(properties.ioThreads()).isEqualTo(1);
        assertThat(properties.dnsThreads()).isEqualTo(2);
        assertThat(properties.dnsQueueCapacity()).isEqualTo(4);
        assertThat(properties.maxConnectionsPerRoute()).isEqualTo(4);
        assertThat(properties.maxConnections()).isEqualTo(12);
        assertThat(properties.shutdownTimeout()).isEqualTo(Duration.ofSeconds(15));
    }

    @Test
    @DisplayName("전체 연결 한도를 초과하는 호스트별 연결 설정을 거부한다")
    void rejectRouteLimitGreaterThanTotal() {
        // Given / When / Then
        assertThatThrownBy(() -> new PushDeliveryProperties(null, null, null, null, 13, 12,
                null, null, null, null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("무제한 대기가 될 수 있는 0 타임아웃을 거부한다")
    void rejectZeroTimeout() {
        // Given / When / Then
        assertThatThrownBy(() -> new PushDeliveryProperties(null, null, null, null, null, null,
                Duration.ZERO, null, null, null)).isInstanceOf(IllegalArgumentException.class);
    }
}

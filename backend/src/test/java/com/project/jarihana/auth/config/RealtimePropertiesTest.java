package com.project.jarihana.auth.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class RealtimePropertiesTest {
    @Test
    @DisplayName("접속 주소를 지정하지 않으면 로컬 WebSocket 주소를 사용한다")
    void usesLocalWebsocketUrlByDefault() {
        // Given / When
        var properties = new RealtimeProperties(null);

        // Then
        assertThat(properties.websocketUrl()).isEqualTo("ws://localhost:8090/ws/realtime");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ws://example.test/ws/realtime", "https://example.test/ws/realtime", "wss://user:secret@example.test/ws",
            "wss://example.test/ws?token=secret", "wss://example.test/ws#fragment"})
    @DisplayName("운영 접속 주소는 비밀값 없는 WSS 주소여야 한다")
    void rejectsUnsafeWebsocketUrls(String url) {
        // Given / When / Then
        assertThatThrownBy(() -> new RealtimeProperties(url))
                .isInstanceOf(IllegalArgumentException.class);
    }

}

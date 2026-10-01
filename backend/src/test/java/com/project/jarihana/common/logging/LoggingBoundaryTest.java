package com.project.jarihana.common.logging;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LoggingBoundaryTest {
    @Test
    @DisplayName("안전한 예외 필드는 원인과 메시지의 비밀값을 버린다")
    void discardsSecretMessagesAndCauses() throws Exception {
        // Given
        Throwable error = new IllegalStateException("secret-token", new RuntimeException("secret-sql"));
        // When
        Class<?> type = Class.forName("com.project.jarihana.common.logging.SafeExceptionLogFields");
        Object fields = type.getMethod("from", Throwable.class).invoke(null, error);
        // Then
        assertThat(fields.toString()).contains("IllegalStateException", "LoggingBoundaryTest")
                .doesNotContain("secret-token", "secret-sql");
        assertThat(((Map<?, ?>) fields).get("error.stack_trace").toString().length()).isLessThanOrEqualTo(8192);
    }
}

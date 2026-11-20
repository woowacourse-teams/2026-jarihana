package com.project.jarihana.gomoku.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.client.HttpClientErrorException;

class GomokuPostHogSchedulingConfigTest {

    @Test
    @DisplayName("PostHog 전송 오류에 분류 키와 HTTP 상태를 기록하고 응답 본문은 숨긴다")
    void logsHttpStatusWithoutResponseBody() {
        // Given
        var dispatcher = mock(GomokuPostHogDispatcher.class);
        var exception = new HttpClientErrorException(HttpStatus.BAD_REQUEST, "PostHog response body");
        doThrow(exception).when(dispatcher).deliverPending();
        var config = new GomokuPostHogSchedulingConfig(dispatcher);
        var logger = (Logger) LoggerFactory.getLogger(GomokuPostHogSchedulingConfig.class);
        var logs = new ListAppender<ILoggingEvent>();
        logs.start();
        logger.addAppender(logs);
        try {
            // When
            config.dispatch();

            // Then
            assertThat(logs.list).singleElement().satisfies(event -> {
                assertThat(event.getLevel()).isEqualTo(Level.ERROR);
                assertThat(event.getKeyValuePairs())
                        .extracting(pair -> pair.key, pair -> pair.value)
                        .containsExactlyInAnyOrder(
                                tuple("event.action", "gomoku.posthog.delivery.failed"),
                                tuple("error.type", exception.getClass().getName()),
                                tuple("http.response.status_code", 400));
                assertThat(event.getFormattedMessage()).doesNotContain("PostHog response body");
                assertThat(event.getThrowableProxy()).isNull();
            });
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }
}

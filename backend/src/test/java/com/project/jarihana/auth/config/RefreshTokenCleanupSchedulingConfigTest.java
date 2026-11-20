package com.project.jarihana.auth.config;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.project.jarihana.auth.command.service.RefreshTokenCleaner;
import com.project.jarihana.auth.command.service.dto.RefreshTokenCleanupResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RefreshTokenCleanupSchedulingConfigTest {

    private final RefreshTokenCleaner cleaner = mock(RefreshTokenCleaner.class);
    private final RefreshTokenCleanupSchedulingConfig config = new RefreshTokenCleanupSchedulingConfig(cleaner);
    private final Logger logger = (Logger) LoggerFactory.getLogger(RefreshTokenCleanupSchedulingConfig.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeEach
    void attachAppender() {
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void detachAppender() {
        logger.detachAppender(logs);
        logs.stop();
    }

    @DisplayName("설정이 없으면 기동 5분 뒤 처음 실행하고 이후 1시간 간격으로 실행하도록 등록한다.")
    @Test
    void scheduleWithDefaultIntervalWhenEnabledIsMissing() {
        // Given
        ApplicationContextRunner runner = contextRunner();

        // When
        // Then
        runner.run(context -> {
            assertThat(context).hasSingleBean(RefreshTokenCleanupSchedulingConfig.class);
            assertThat(context.getBean(ScheduledTaskHolder.class).getScheduledTasks())
                    .extracting(ScheduledTask::getTask)
                    .singleElement()
                    .isInstanceOfSatisfying(FixedDelayTask.class, task -> {
                        assertThat(task.getIntervalDuration()).isEqualTo(Duration.ofHours(1));
                        assertThat(task.getInitialDelayDuration()).isEqualTo(Duration.ofMinutes(5));
                    });
        });
    }

    @DisplayName("enabled가 false면 정리 작업을 등록하지 않는다.")
    @Test
    void notScheduleWhenDisabled() {
        // Given
        ApplicationContextRunner runner = contextRunner()
                .withPropertyValues("jarihana.auth.refresh-token-cleanup.enabled=false");

        // When
        // Then
        runner.run(context -> assertThat(context).doesNotHaveBean(RefreshTokenCleanupSchedulingConfig.class));
    }

    @DisplayName("지운 행이 있으면 패밀리 수와 토큰 수를 남긴다.")
    @Test
    void logRemovedCounts() {
        // Given
        when(cleaner.removeExpired()).thenReturn(new RefreshTokenCleanupResult(2, 5, 3));

        // When
        config.removeExpiredRefreshTokens();

        // Then
        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.INFO);
            assertThat(event.getKeyValuePairs())
                    .extracting(pair -> pair.key, pair -> pair.value)
                    .containsExactlyInAnyOrder(
                            tuple("event.action", "auth.refresh_token.cleanup.completed"),
                            tuple("auth.refresh_token_family.removed", 2),
                            tuple("auth.refresh_token.removed", 8));
        });
    }

    @DisplayName("지운 행이 없으면 로그를 남기지 않는다.")
    @Test
    void stayQuietWhenNothingRemoved() {
        // Given
        when(cleaner.removeExpired()).thenReturn(new RefreshTokenCleanupResult(0, 0, 0));

        // When
        config.removeExpiredRefreshTokens();

        // Then
        assertThat(logs.list).isEmpty();
    }

    @DisplayName("정리가 실패해도 예외를 스케줄러로 넘기지 않고 오류 종류만 남긴다.")
    @Test
    void logFailureWithoutPropagating() {
        // Given
        QueryTimeoutException failure = new QueryTimeoutException("delete from refresh_token ...");
        doThrow(failure).when(cleaner).removeExpired();

        // When
        // Then
        assertThatCode(config::removeExpiredRefreshTokens).doesNotThrowAnyException();
        assertThat(logs.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.ERROR);
            assertThat(event.getKeyValuePairs())
                    .extracting(pair -> pair.key, pair -> pair.value)
                    .containsExactlyInAnyOrder(
                            tuple("event.action", "auth.refresh_token.cleanup.failed"),
                            tuple("error.type", failure.getClass().getName()));
            assertThat(event.getFormattedMessage()).doesNotContain("refresh_token ...");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private ApplicationContextRunner contextRunner() {
        return new ApplicationContextRunner()
                .withBean(RefreshTokenCleaner.class, () -> cleaner)
                .withUserConfiguration(RefreshTokenCleanupSchedulingConfig.class);
    }
}

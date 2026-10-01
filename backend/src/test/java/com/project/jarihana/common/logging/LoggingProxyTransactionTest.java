package com.project.jarihana.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.AuthCommandService;
import com.project.jarihana.auth.command.service.RefreshTokenHasher;
import com.project.jarihana.auth.command.service.dto.LogoutCommand;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.common.config.LoggingConfig;
import java.time.Clock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

class LoggingProxyTransactionTest {
    @Test
    @DisplayName("자동 프록시가 실제 서비스 커밋 이후 성공을 기록한다")
    void automaticProxyLogsAfterRealServiceCommit() {
        // Given
        ListAppender<ILoggingEvent> events = capture();
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(LoggingConfig.class, Fixtures.class)) {
            AuthCommandService service = context.getBean(AuthCommandService.class);
            LocalTransactionManager manager = context.getBean(LocalTransactionManager.class);
            // When
            service.logout(new LogoutCommand(42L, null, null));
            // Then
            assertThat(AopUtils.isAopProxy(service)).isTrue();
            assertThat(manager.committed).isTrue();
            assertThat(events.list).hasSize(1);
            assertThat(events.list.getFirst().getKeyValuePairs().stream().map(pair -> pair.value).toList())
                    .contains("auth.logout.completed", "success");
        } finally { detach(events); }
    }

    @Test
    @DisplayName("실제 서비스 커밋 실패는 완료 이벤트 없이 원래 예외를 전파한다")
    void commitFailureDoesNotEmitCompleted() {
        // Given
        ListAppender<ILoggingEvent> events = capture();
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(LoggingConfig.class, Fixtures.class)) {
            AuthCommandService service = context.getBean(AuthCommandService.class);
            context.getBean(LocalTransactionManager.class).failCommit = true;
            // When / Then
            assertThatThrownBy(() -> service.logout(new LogoutCommand(42L, null, null)))
                    .isInstanceOf(IllegalStateException.class).hasMessage("commit-secret");
            assertThat(events.list).hasSize(1);
            assertThat(events.list.getFirst().getKeyValuePairs().toString()).contains("auth.logout.failed")
                    .doesNotContain("auth.logout.completed", "commit-secret");
        } finally { detach(events); }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Fixtures {
        @Bean LocalTransactionManager transactionManager() { return new LocalTransactionManager(); }
        @Bean AuthCommandService service() {
            return new AuthCommandService(mock(RefreshTokenRepository.class), mock(RefreshTokenHasher.class),
                    mock(AccessTokenProvider.class), Clock.systemUTC());
        }
    }
    static class LocalTransactionManager extends AbstractPlatformTransactionManager {
        boolean committed;
        boolean failCommit;
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) { }
        protected void doCommit(DefaultTransactionStatus status) {
            if (failCommit) { throw new IllegalStateException("commit-secret"); }
            committed = true;
        }
        protected void doRollback(DefaultTransactionStatus status) { }
    }
    private ListAppender<ILoggingEvent> capture() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>(); appender.start();
        ((Logger) LoggerFactory.getLogger(Events.class)).addAppender(appender); return appender;
    }
    private void detach(ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger(Events.class)).detachAppender(appender); appender.stop();
    }
}

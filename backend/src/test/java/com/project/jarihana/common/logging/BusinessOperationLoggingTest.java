package com.project.jarihana.common.logging;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.project.jarihana.recruitment.command.service.RecruitmentCommandService;
import java.lang.reflect.Method;
import java.lang.reflect.AccessibleObject;
import java.util.List;
import com.project.jarihana.recruitment.command.service.dto.CloseRecruitmentResult;
import com.project.jarihana.recruitment.domain.RecruitmentPhase;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;

class BusinessOperationLoggingTest {
    @Test
    @DisplayName("외부 트랜잭션 커밋 전에 성공 로그를 기록하지 않는다")
    void logsOnlyAfterOuterCommit() throws Throwable {
        // Given
        ListAppender<ILoggingEvent> events = capture();
        MethodInterceptor interceptor = interceptor();
        TransactionTemplate transaction = new TransactionTemplate(new LocalTransactionManager());
        try {
            // When
            transaction.executeWithoutResult(status -> {
                invoke(interceptor);
                assertThat(events.list).isEmpty();
            });
            // Then
            assertThat(events.list).hasSize(1);
            assertThat(events.list.getFirst().getKeyValuePairs().stream().map(pair -> pair.value).toList())
                    .contains("recruitment.close.completed", "success", 12L, 34L, "CLOSED", "business", List.of("end"));
        } finally {
            detach(events);
        }
    }

    @Test
    @DisplayName("외부 트랜잭션 롤백에서는 성공 이벤트를 남기지 않는다")
    void suppressesSuccessOnOuterRollback() throws Throwable {
        // Given
        ListAppender<ILoggingEvent> events = capture();
        MethodInterceptor interceptor = interceptor();
        TransactionTemplate transaction = new TransactionTemplate(new LocalTransactionManager());
        try {
            // When
            transaction.executeWithoutResult(status -> {
                invoke(interceptor);
                status.setRollbackOnly();
            });
            // Then
            assertThat(events.list).isEmpty();
        } finally {
            detach(events);
        }
    }

    private MethodInterceptor interceptor() throws Exception {
        return (MethodInterceptor) Class.forName("com.project.jarihana.common.logging.BusinessOperationLoggingInterceptor")
                .getConstructor().newInstance();
    }

    private void invoke(MethodInterceptor interceptor) {
        try {
            interceptor.invoke(new MethodInvocation() {
                public Method getMethod() {
                    try { return RecruitmentCommandService.class.getMethod("closeRecruitment", long.class, long.class, long.class); }
                    catch (NoSuchMethodException exception) { throw new IllegalStateException(exception); }
                }
                public Object[] getArguments() { return new Object[] { 9L, 12L, 34L }; }
                public Object proceed() { return new CloseRecruitmentResult(34, null, RecruitmentPhase.CLOSED); }
                public Object getThis() { return null; }
                public AccessibleObject getStaticPart() { return getMethod(); }
            });
        } catch (Throwable error) { throw new AssertionError(error); }
    }

    private ListAppender<ILoggingEvent> capture() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ((Logger) LoggerFactory.getLogger("com.project.jarihana.common.logging.Events")).addAppender(appender);
        return appender;
    }
    private void detach(ListAppender<ILoggingEvent> appender) {
        ((Logger) LoggerFactory.getLogger("com.project.jarihana.common.logging.Events")).detachAppender(appender);
        appender.stop();
    }
    static class LocalTransactionManager extends AbstractPlatformTransactionManager {
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) { }
        protected void doCommit(DefaultTransactionStatus status) { }
        protected void doRollback(DefaultTransactionStatus status) { }
    }
}

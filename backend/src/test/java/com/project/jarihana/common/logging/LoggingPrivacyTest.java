package com.project.jarihana.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.project.jarihana.group.query.controller.dto.GroupListRequest;
import com.project.jarihana.image.client.S3ImageStorage;
import com.project.jarihana.image.config.ImageProperties;
import java.util.List;
import org.aopalliance.intercept.MethodInvocation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.aop.framework.ProxyFactory;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import static org.mockito.ArgumentMatchers.any;

class LoggingPrivacyTest {
    @Test
    @DisplayName("중첩 예외는 원인 타입과 프레임만 남기고 모든 예외 메시지를 제외한다")
    void preservesCauseFramesWithoutMessages() {
        // Given
        IllegalArgumentException cause = new IllegalArgumentException("secret-cause-message");
        cause.setStackTrace(new StackTraceElement[] {
                new StackTraceElement("example.Persistence", "commit", "Persistence.java", 42)
        });
        IllegalStateException exception = new IllegalStateException("secret-outer-message", cause);

        // When
        var fields = SafeExceptionLogFields.from(exception);

        // Then
        assertThat(fields).containsEntry("error.type", IllegalStateException.class.getName());
        assertThat(fields.get("error.stack_trace").toString())
                .contains(IllegalArgumentException.class.getName(), "example.Persistence.commit(Persistence.java:42)")
                .doesNotContain("secret-cause-message", "secret-outer-message");
    }

    @Test
    @DisplayName("목록 입력은 원문 검색어와 커서를 기록하지 않는다")
    void omitsKeywordAndRawCursor() throws Throwable {
        // Given
        RequestLogContext.begin("test-request");
        MethodInvocation invocation = mock(MethodInvocation.class);
        when(invocation.getArguments()).thenReturn(new Object[] {
                new GroupListRequest(null, null, null, null, null, null, true, "secret-keyword", "secret-cursor", 25)
        });
        try {
            // When
            new ControllerInputLoggingInterceptor().invoke(invocation);
            // Then
            assertThat(RequestLogContext.snapshot()).containsEntry("jarihana.request.query.cursor_present", true)
                    .containsEntry("jarihana.request.query.size", 25)
                    .containsEntry("jarihana.request.query.status", "ACTIVE");
            assertThat(RequestLogContext.snapshot().toString()).doesNotContain("secret-keyword", "secret-cursor");
        } finally { RequestLogContext.clear(); MDC.clear(); }
    }

    @Test
    @DisplayName("존재하지 않는 S3 객체는 실패가 아닌 정상 부재 이벤트다")
    void s3NotFoundIsSuccessfulAbsence() {
        // Given
        S3Client client = mock(S3Client.class);
        when(client.headObject(any(HeadObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(404).message("secret-key").build());
        ImageProperties properties = mock(ImageProperties.class);
        when(properties.bucket()).thenReturn("secret-bucket");
        ProxyFactory proxy = new ProxyFactory(new S3ImageStorage(mock(S3Presigner.class), client, properties));
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new ExternalAdapterLoggingInterceptor());
        ListAppender<ILoggingEvent> events = new ListAppender<>(); events.start();
        Logger logger = (Logger) LoggerFactory.getLogger(Events.class); logger.addAppender(events);
        try {
            // When
            boolean exists = ((S3ImageStorage) proxy.getProxy()).exists("secret-key");
            // Then
            assertThat(exists).isFalse();
            assertThat(events.list).hasSize(1);
            assertThat(events.list.getFirst().getKeyValuePairs().toString()).contains("s3.object.exists.completed", "success", "false")
                    .doesNotContain("secret-key", "secret-bucket");
        } finally { logger.detachAppender(events); events.stop(); }
    }

    @Test
    @DisplayName("요청 없는 컨텍스트 설정은 스레드 MDC를 오염시키지 않는다")
    void contextMutationsOutsideRequestDoNothing() {
        // Given / When
        RequestLogContext.setMemberId(42);
        RequestLogContext.setAuthenticationFailure("TOKEN_INVALID");
        RequestLogContext.setErrorCode("ERROR");
        RequestLogContext.setInvalidFields(List.of("capacity"));
        // Then
        assertThat(RequestLogContext.snapshot()).isEmpty();
        assertThat(MDC.get("user.id")).isNull();
    }
}

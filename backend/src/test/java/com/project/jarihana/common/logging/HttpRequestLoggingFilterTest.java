package com.project.jarihana.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.Filter;
import jakarta.servlet.ServletException;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class HttpRequestLoggingFilterTest {
    @Test
    @DisplayName("거절 요청에도 생성한 요청 ID와 상태를 기록하고 MDC를 복구한다")
    void recordsDeniedResponseWithGeneratedIdAndRestoresMdc() throws Exception {
        // Given
        ListAppender<ILoggingEvent> appender = capture();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/private?secret");
        request.addHeader("X-Request-Id", "untrusted-secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MDC.put("existing", "preserved");
        try {
            // When
            filter().doFilter(request, response, (req, res) -> response.setStatus(401));
            // Then
            assertThat(response.getHeader("X-Request-Id")).isNotBlank().isNotEqualTo("untrusted-secret");
            assertThat(appender.list).hasSize(2);
            assertThat(values(appender.list.getLast())).contains("http.request.completed", 401, "failure");
            assertThat(appender.list.toString()).doesNotContain("untrusted-secret", "private?secret");
            assertThat(MDC.getCopyOfContextMap()).containsOnlyKeys("existing");
        } finally {
            MDC.clear();
            detach(appender);
        }
    }

    @Test
    @DisplayName("처리되지 않은 예외는 전파하고 500 완료 로그를 한 번 기록한다")
    void propagatesUncaughtFailureAndRecords500Once() throws Exception {
        // Given
        ListAppender<ILoggingEvent> appender = capture();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        Filter filter = filter();
        ServletException failure = new ServletException("secret");
        try {
            // When / Then
            assertThatThrownBy(() -> filter.doFilter(request, response, (req, res) -> { throw failure; }))
                    .isSameAs(failure);
            assertThat(appender.list).hasSize(2);
            assertThat(values(appender.list.getLast())).contains(500, "failure");
            assertThat(MDC.get("http.request.id")).isNull();
        } finally {
            detach(appender);
        }
    }

    @Test
    @DisplayName("보안 필터보다 앞선 시작 로그는 알려진 경로만 정규화한다")
    void normalizesKnownPathsBeforeSecurityWithoutLoggingRawSegments() throws Exception {
        // Given
        ListAppender<ILoggingEvent> appender = capture();
        MockHttpServletRequest request = new MockHttpServletRequest("PATCH", "/api/groups/12/recruitments/34");
        request.setContextPath("/api");
        MockHttpServletResponse response = new MockHttpServletResponse();
        try {
            // When
            filter().doFilter(request, response, (req, res) -> response.setStatus(403));
            // Then
            assertThat(values(appender.list.getFirst())).contains("/api/groups/{groupId}/recruitments/{recruitmentId}");
            assertThat(values(appender.list.getLast())).contains("/api/groups/{groupId}/recruitments/{recruitmentId}");
        } finally { detach(appender); }
    }

    private Filter filter() throws Exception {
        return (Filter) Class.forName("com.project.jarihana.common.logging.HttpRequestLoggingFilter")
                .getConstructor().newInstance();
    }

    @Test
    @DisplayName("공유 초대의 인증 실패·없는 주소·서버 오류 로그에도 원본 토큰과 쿼리를 남기지 않는다")
    void invitationFailuresDoNotLogTokenOrQuery() throws Exception {
        String token = "A".repeat(43);
        ListAppender<ILoggingEvent> appender = capture();
        try {
            for (int status : List.of(401, 404, 500)) {
                MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/invitations/links/" + token);
                request.setContextPath("/api");
                request.setQueryString("token=private-query");
                filter().doFilter(request, new MockHttpServletResponse(),
                        (req, res) -> ((MockHttpServletResponse) res).setStatus(status));
            }
            assertThat(appender.list).hasSize(6);
            for (ILoggingEvent event : appender.list) {
                assertThat(values(event).toString()).doesNotContain(token, "private-query", "/invitations/links/");
            }
        } finally {
            detach(appender);
        }
    }

    private List<Object> values(ILoggingEvent event) {
        return event.getKeyValuePairs().stream().map(pair -> pair.value).toList();
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
}

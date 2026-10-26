package com.project.jarihana.common.config;

import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import jakarta.servlet.AsyncContext;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.ServerSocket;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("prod")
@TestPropertySource(properties = {
        "management.server.address=127.0.0.1",
        "jarihana.push.worker-control-enabled=true",
        "jarihana.push.worker-host-id=activity-test",
        "jarihana.push.worker-environment=activity-test",
        "jarihana.worker-control.token=activity-test-token-0123456789abcdef"
})
@Import(ApplicationActivityAcceptanceTest.ProbeConfiguration.class)
class ApplicationActivityAcceptanceTest extends IntegrationTestSupport {
    private static final String TOKEN = "activity-test-token-0123456789abcdef";
    private static final int MANAGEMENT_PORT = findAvailablePort();

    @DynamicPropertySource
    static void configureManagementPort(DynamicPropertyRegistry registry) {
        registry.add("management.server.port", () -> MANAGEMENT_PORT);
    }

    @Value("${local.management.port}") private int managementPort;
    @Autowired private ProbeServlet probe;

    @BeforeEach
    void resetProbe() {
        probe.entered = new CountDownLatch(1);
        probe.release = new CountDownLatch(1);
        probe.asyncReturned = new CountDownLatch(1);
        probe.async = null;
    }

    @Test
    @DisplayName("응답을 기다리는 HTTP 요청이 있으면 관리 API가 진행 중 요청 한 건을 반환한다.")
    void countHttpRequestUntilResponseFinishes() throws Exception {
        // Given
        try (var executor = Executors.newSingleThreadExecutor()) {
            var response = executor.submit(() -> RestAssured.get("/groups/__deployment_sync"));
            try {
                // When
                assertThat(probe.entered.await(10, TimeUnit.SECONDS)).isTrue();

                // Then
                assertHttpCount(1);
            } finally {
                probe.release.countDown();
            }
            assertThat(response.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
        }
        awaitHttpIdle();
    }

    @Test
    @DisplayName("비동기 요청은 Servlet 메서드가 반환돼도 응답을 완료할 때까지 진행 중으로 센다.")
    void countAsyncRequestUntilCompletion() throws Exception {
        // Given
        try (var executor = Executors.newSingleThreadExecutor()) {
            var response = executor.submit(() -> RestAssured.get("/groups/__deployment_async"));
            try {
                // When
                assertThat(probe.entered.await(10, TimeUnit.SECONDS)).isTrue();
                assertThat(probe.asyncReturned.await(10, TimeUnit.SECONDS)).isTrue();

                // Then
                assertHttpCount(1);
            } finally {
                if (probe.async != null) {
                    probe.async.getResponse().getWriter().write("completed");
                    probe.async.complete();
                }
            }
            assertThat(response.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(200);
        }
        awaitHttpIdle();
    }

    @Test
    @DisplayName("오류 응답이 끝나면 요청 수가 줄고 관리 API 조회 자체는 사용자 요청 수에 포함되지 않는다.")
    void finishErrorRequestAndExcludeManagementPolling() throws Exception {
        // Given / When
        assertThat(RestAssured.get("/groups/__deployment_error").statusCode()).isEqualTo(500);

        // Then
        awaitHttpIdle();
        assertHttpCount(0);
    }

    private int httpCount() {
        var result = RestAssured.given().port(managementPort).basePath("")
                .header("X-Jarihana-Worker-Control-Token", TOKEN)
                .get("/actuator/workercontrol").then().statusCode(200).extract();
        assertThat(result.jsonPath().getMap("activity")).containsKeys("httpInFlight", "backgroundInFlight");
        return result.jsonPath().getInt("activity.httpInFlight");
    }

    private void assertHttpCount(int expected) {
        assertThat(httpCount()).isEqualTo(expected);
    }

    private void awaitHttpIdle() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (httpCount() != 0 && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertHttpCount(0);
    }

    private static int findAvailablePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException exception) {
            throw new IllegalStateException("테스트용 관리 포트를 할당하지 못했습니다.", exception);
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ProbeConfiguration {
        @Bean
        ProbeServlet probeServlet() { return new ProbeServlet(); }

        @Bean
        ServletRegistrationBean<ProbeServlet> probeRegistration(ProbeServlet servlet) {
            var registration = new ServletRegistrationBean<>(servlet, "/groups/__deployment_sync",
                    "/groups/__deployment_async", "/groups/__deployment_error");
            registration.setAsyncSupported(true);
            return registration;
        }

        @Bean
        FilterRegistrationBean<Filter> asyncReturnProbe(ProbeServlet servlet) {
            var registration = new FilterRegistrationBean<Filter>((request, response, chain) -> {
                try {
                    chain.doFilter(request, response);
                } finally {
                    if (request.isAsyncStarted()) { servlet.asyncReturned.countDown(); }
                }
            });
            registration.setAsyncSupported(true);
            return registration;
        }
    }

    static class ProbeServlet extends HttpServlet {
        private volatile CountDownLatch entered;
        private volatile CountDownLatch release;
        private volatile CountDownLatch asyncReturned;
        private volatile AsyncContext async;

        @Override
        protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
            if (request.getRequestURI().endsWith("_error")) {
                response.setStatus(500);
                return;
            }
            if (request.getRequestURI().endsWith("_async")) {
                async = request.startAsync();
                async.setTimeout(15000);
                entered.countDown();
                return;
            }
            entered.countDown();
            try {
                if (!release.await(10, TimeUnit.SECONDS)) { throw new IOException("테스트 HTTP 응답 대기 시간 초과"); }
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IOException("테스트 HTTP 응답 대기 중 인터럽트", exception);
            }
            response.getWriter().write("completed");
        }
    }
}

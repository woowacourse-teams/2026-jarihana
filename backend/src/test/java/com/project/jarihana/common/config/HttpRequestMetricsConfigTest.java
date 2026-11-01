package com.project.jarihana.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.observation.DefaultMeterObservationHandler;
import io.micrometer.observation.ObservationRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.micrometer.metrics.autoconfigure.MetricsAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.observation.ServerRequestObservationConvention;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.filter.ServerHttpObservationFilter;

class HttpRequestMetricsConfigTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MetricsAutoConfiguration.class))
            .withUserConfiguration(HttpRequestMetricsConfig.class)
            .withBean(PrometheusMeterRegistry.class, () -> new PrometheusMeterRegistry(PrometheusConfig.DEFAULT))
            .withPropertyValues("management.metrics.use-global-registry=false",
                    "management.metrics.distribution.percentiles-histogram.http.server.requests=true");

    @Test
    @DisplayName("사용자 요청 전에도 HTTP 요청 수와 누적 시간이 0으로 노출된다")
    void exposesZeroHttpMetricsBeforeAnyUserRequest() {
        contextRunner.run(context -> {
            // Given
            var registry = context.getBean(PrometheusMeterRegistry.class);

            // When
            Timer timer = registry.find("http.server.requests").tag("uri", "/groups")
                    .tag("deployment.probe", "false").timer();

            // Then
            assertThat(timer).isNotNull();
            assertThat(timer.count()).isZero();
            assertThat(timer.totalTime(TimeUnit.SECONDS)).isZero();
            assertThat(registry.scrape()).contains("http_server_requests_seconds_count")
                    .contains("http_server_requests_seconds_sum");
        });
    }

    @Test
    @DisplayName("그룹 한 건을 조회하는 사용자와 부하테스트 요청은 성공과 실패 모두 HTTP 지표에 포함한다")
    void includesUserAndLoadTestRequestsForTheSameProbeUrl() {
        contextRunner.run(context -> {
            // Given
            var registry = context.getBean(PrometheusMeterRegistry.class);
            MockMvc mvc = mvc(registry, context.getBean(ServerRequestObservationConvention.class));

            // When
            mvc.perform(get("/groups").param("size", "1")).andExpect(status().isOk());
            mvc.perform(get("/groups").param("size", "1").param("status", "500")
                    .header("User-Agent", "k6/1.0")).andExpect(status().isInternalServerError());

            // Then
            assertThat(registry.get("http.server.requests").tag("status", "200").timer().count()).isEqualTo(1);
            assertThat(registry.get("http.server.requests").tag("status", "500").timer().count()).isEqualTo(1);
        });
    }

    @Test
    @DisplayName("표시된 점검의 성공과 실패는 HTTP 횟수와 시간 및 히스토그램에 추가되지 않는다")
    void excludesMarkedProbeSuccessAndFailureFromHttpMetrics() {
        contextRunner.run(context -> {
            // Given
            var registry = context.getBean(PrometheusMeterRegistry.class);
            MockMvc mvc = mvc(registry, context.getBean(ServerRequestObservationConvention.class));
            mvc.perform(get("/groups").param("size", "1")).andExpect(status().isOk());
            String before = registry.scrape();

            // When
            mvc.perform(get("/api/groups").contextPath("/api").param("size", "1")
                    .header("X-Jarihana-Deployment-Probe", "true"))
                    .andExpect(status().isOk());
            mvc.perform(get("/groups").param("size", "1").param("status", "500")
                    .header("X-Jarihana-Deployment-Probe", "true")).andExpect(status().isInternalServerError());

            // Then
            assertThat(registry.scrape().lines().filter(line -> line.startsWith("http_server_requests_seconds")))
                    .containsExactlyElementsOf(before.lines().filter(line -> line.startsWith("http_server_requests_seconds")).toList());
            assertThat(registry.get("jdbc.query").timer().count()).isEqualTo(3);
        });
    }

    @Test
    @DisplayName("다른 크기와 경로 및 메서드의 요청은 점검 표시가 있어도 HTTP 지표에 포함한다")
    void limitsProbeClassificationToTheDeploymentReadRequest() {
        contextRunner.run(context -> {
            // Given
            var registry = context.getBean(PrometheusMeterRegistry.class);
            MockMvc mvc = mvc(registry, context.getBean(ServerRequestObservationConvention.class));

            // When
            mvc.perform(get("/groups").param("size", "2").header("X-Jarihana-Deployment-Probe", "true"))
                    .andExpect(status().isOk());
            mvc.perform(get("/groups").param("size", "1").header("X-Jarihana-Deployment-Probe", "other"))
                    .andExpect(status().isOk());
            mvc.perform(get("/other").header("X-Jarihana-Deployment-Probe", "true"))
                    .andExpect(status().isNotFound());
            mvc.perform(post("/groups").param("size", "1").header("X-Jarihana-Deployment-Probe", "true"))
                    .andExpect(status().isMethodNotAllowed());

            // Then
            assertThat(registry.find("http.server.requests").timers().stream().mapToLong(Timer::count).sum())
                    .isEqualTo(4);
        });
    }

    private MockMvc mvc(PrometheusMeterRegistry registry, ServerRequestObservationConvention convention) {
        var observations = ObservationRegistry.create();
        observations.observationConfig().observationHandler(new DefaultMeterObservationHandler(registry));
        return MockMvcBuilders.standaloneSetup(new GroupProbeController(registry))
                .addFilters(new ServerHttpObservationFilter(observations, convention)).build();
    }

    @RestController
    static class GroupProbeController {
        private final PrometheusMeterRegistry registry;

        GroupProbeController(PrometheusMeterRegistry registry) {
            this.registry = registry;
        }

        @GetMapping("/groups")
        ResponseEntity<String> findGroups(@RequestParam(defaultValue = "200") int status) {
            registry.timer("jdbc.query").record(Duration.ofMillis(1));
            return ResponseEntity.status(status).body("groups");
        }
    }
}

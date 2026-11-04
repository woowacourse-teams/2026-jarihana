package com.project.jarihana.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import jakarta.servlet.AsyncEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockAsyncContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class SseMetricsConfigTest {
    private final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
    private final Streams controller = new Streams();
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .addInterceptors(new SseMetricsInterceptor(metrics)).build();
    }

    @Test
    @DisplayName("실제 SSE의 연결 수는 종료 시 감소하고 비동기 재디스패치는 재시도로 세지 않는다")
    void countsActiveUntilCompletedWithoutDuplicatingDispatch() throws Exception {
        // Given
        var first = mvc.perform(get("/rooms/1/events")).andReturn();
        SseEmitter one = controller.latest;
        var second = mvc.perform(get("/rooms/2/events")).andReturn();
        // When
        assertThat(active("/rooms/{id}/events")).isEqualTo(2);
        one.complete();
        mvc.perform(asyncDispatch(first)).andExpect(status().isOk());
        // Then
        assertThat(active("/rooms/{id}/events")).isEqualTo(1);
        assertThat(attempts("/rooms/{id}/events")).isEqualTo(2);
        controller.latest.complete();
        mvc.perform(asyncDispatch(second));
        assertThat(active("/rooms/{id}/events")).isZero();
        assertThat(metrics.find("jarihana.sse.connections.rejected").counters())
                .isNotEmpty().allSatisfy(counter -> assertThat(counter.count()).isZero());
    }

    @Test
    @DisplayName("서로 다른 SSE 경로는 템플릿별로 집계하고 일반 HTTP는 제외한다")
    void separatesEndpointsAndIgnoresOrdinaryHttp() throws Exception {
        // Given / When
        mvc.perform(get("/rooms/123/events"));
        mvc.perform(get("/notifications"));
        mvc.perform(get("/normal"));
        // Then
        assertThat(active("/rooms/{id}/events")).isEqualTo(1);
        assertThat(active("/notifications")).isEqualTo(1);
        assertThat(metrics.find("jarihana.sse.connections.attempts").counters()).hasSize(2);
    }

    @Test
    @DisplayName("연결 전 거절은 시도와 상태별 거부 수에 포함하고 활성 연결은 늘리지 않는다")
    void countsRejectedAdmission() throws Exception {
        // Given / When
        mvc.perform(get("/rooms/1/events").param("reject", "true"))
                .andExpect(status().isServiceUnavailable());
        // Then
        assertThat(attempts("/rooms/{id}/events")).isEqualTo(1);
        assertThat(active("/rooms/{id}/events")).isZero();
        assertThat(metrics.get("jarihana.sse.connections.rejected")
                .tags("uri", "/rooms/{id}/events", "status", "503").counter().count()).isEqualTo(1);
    }

    @Test
    @DisplayName("시간 초과와 오류 및 종료 콜백이 겹쳐도 연결 수를 한 번만 감소시킨다")
    void closesOnceAcrossTimeoutErrorAndCompletion() throws Exception {
        // Given
        var result = mvc.perform(get("/notifications")).andReturn();
        var async = (MockAsyncContext) result.getRequest().getAsyncContext();
        // When
        for (var listener : async.getListeners()) listener.onTimeout(new AsyncEvent(async));
        for (var listener : async.getListeners()) listener.onError(new AsyncEvent(async, new IllegalStateException("disconnected")));
        for (var listener : async.getListeners()) listener.onComplete(new AsyncEvent(async));
        // Then
        assertThat(active("/notifications")).isZero();
        assertThat(attempts("/notifications")).isEqualTo(1);
        assertThat(metrics.find("jarihana.sse.connections.rejected").counters())
                .isNotEmpty().allSatisfy(counter -> assertThat(counter.count()).isZero());
    }

    @Test
    @DisplayName("요청 전부터 SSE 경로별 0을 수집하고 최초 503과 429 거부를 각각 한 번 센다")
    void exposesZeroBeforeFirstRequestAndCountsFirstRejectionPerStatus() {
        new WebApplicationContextRunner()
                .withUserConfiguration(SseMetricsConfig.class, MvcConfiguration.class)
                .withBean(PrometheusMeterRegistry.class, () -> new PrometheusMeterRegistry(PrometheusConfig.DEFAULT))
                .run(context -> {
                    // Given
                    var registry = context.getBean(PrometheusMeterRegistry.class);
                    var configuredMvc = MockMvcBuilders.webAppContextSetup(context).build();
                    String baseline = registry.scrape();
                    assertThat(baseline).contains(
                            "jarihana_sse_connections_attempts_total{uri=\"/rooms/{id}/events\"} 0.0",
                            "jarihana_sse_connections_active{uri=\"/rooms/{id}/events\"} 0.0",
                            "jarihana_sse_connections_rejected_total{status=\"503\",uri=\"/rooms/{id}/events\"} 0.0",
                            "jarihana_sse_connections_rejected_total{status=\"429\",uri=\"/rooms/{id}/events\"} 0.0",
                            "jarihana_sse_connections_rejected_total{status=\"503\",uri=\"/notifications\"} 0.0");
                    assertThat(baseline).doesNotContain("uri=\"/normal\"");

                    // When
                    configuredMvc.perform(get("/rooms/1/events").param("reject", "true"))
                            .andExpect(status().isServiceUnavailable());
                    configuredMvc.perform(get("/rooms/2/events").param("reject", "true").param("rejectStatus", "429"))
                            .andExpect(status().isTooManyRequests());

                    // Then
                    String afterRejections = registry.scrape();
                    assertThat(afterRejections).contains(
                            "jarihana_sse_connections_attempts_total{uri=\"/rooms/{id}/events\"} 2.0",
                            "jarihana_sse_connections_active{uri=\"/rooms/{id}/events\"} 0.0",
                            "jarihana_sse_connections_rejected_total{status=\"503\",uri=\"/rooms/{id}/events\"} 1.0",
                            "jarihana_sse_connections_rejected_total{status=\"429\",uri=\"/rooms/{id}/events\"} 1.0");
                    assertThat(registry.scrape()).isEqualTo(afterRejections);
                });
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableWebMvc
    static class MvcConfiguration {
        @Bean
        Streams streams() {
            return new Streams();
        }
    }

    private double active(String uri) {
        return metrics.get("jarihana.sse.connections.active").tag("uri", uri).gauge().value();
    }

    private double attempts(String uri) {
        return metrics.get("jarihana.sse.connections.attempts").tag("uri", uri).counter().count();
    }

    @RestController
    static class Streams {
        SseEmitter latest;

        @GetMapping(value = "/rooms/{id}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        ResponseEntity<?> room(@RequestParam(defaultValue = "false") boolean reject,
                               @RequestParam(defaultValue = "503") int rejectStatus) {
            if (reject) return ResponseEntity.status(rejectStatus).contentType(MediaType.APPLICATION_JSON).body("{}");
            latest = new SseEmitter(120_000L);
            return ResponseEntity.ok(latest);
        }

        @GetMapping(value = "/notifications", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
        SseEmitter notifications() {
            latest = new SseEmitter(120_000L);
            return latest;
        }

        @GetMapping("/normal")
        String normal() { return "ok"; }
    }
}

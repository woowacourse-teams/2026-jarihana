package com.project.jarihana.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.project.jarihana.support.IntegrationTestSupport;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationHandler;
import io.micrometer.observation.ObservationRegistry;
import io.restassured.RestAssured;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.observation.ServerRequestObservationContext;

class HttpRequestMetricsAcceptanceTest extends IntegrationTestSupport {
    @Autowired private MeterRegistry metrics;
    @Autowired private ObservationRegistry observations;

    @Test
    @DisplayName("실제 그룹 조회 API의 HTTP 지표는 점검만 제외하고 사용자와 부하테스트 요청을 센다")
    void excludesOnlyDeploymentProbesThroughTheRealHttpInstrumentation() {
        // Given
        var completed = new AtomicInteger();
        observations.observationConfig().observationHandler(new ObservationHandler<ServerRequestObservationContext>() {
            @Override
            public boolean supportsContext(Observation.Context context) {
                return context instanceof ServerRequestObservationContext;
            }

            @Override
            public void onStop(ServerRequestObservationContext context) {
                completed.incrementAndGet();
            }
        });
        long before = groupRequestCount();

        // When
        RestAssured.given().queryParam("size", 1).get("/groups").then().statusCode(200);
        RestAssured.given().queryParam("size", 1).header("X-Jarihana-Deployment-Probe", "true")
                .get("/groups").then().statusCode(200);
        RestAssured.given().queryParam("size", 1).header("User-Agent", "k6/1.0")
                .get("/groups").then().statusCode(200);
        await().atMost(Duration.ofSeconds(5)).until(() -> completed.get() == 3);

        // Then
        assertThat(groupRequestCount()).isEqualTo(before + 2);
    }

    private long groupRequestCount() {
        return metrics.find("http.server.requests").tag("uri", "/groups").tag("method", "GET")
                .timers().stream().mapToLong(Timer::count).sum();
    }
}

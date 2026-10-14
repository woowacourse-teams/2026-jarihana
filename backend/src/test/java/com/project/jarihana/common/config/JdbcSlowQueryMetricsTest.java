package com.project.jarihana.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.Timer;
import io.micrometer.prometheusmetrics.PrometheusConfig;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.io.IOException;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.micrometer.metrics.autoconfigure.MetricsAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.io.ClassPathResource;

class JdbcSlowQueryMetricsTest {

    @ParameterizedTest
    @ValueSource(strings = {"dev", "prod"})
    @DisplayName("개발과 운영 쿼리 히스토그램은 100ms, 500ms, 1초 경계를 구분한다.")
    void queryHistogramDistinguishesSlowExecutionBoundaries(String profile) throws IOException {
        // Given
        var propertySources = new YamlPropertySourceLoader().load(profile,
                new ClassPathResource("application-" + profile + ".yaml"));
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(MetricsAutoConfiguration.class))
                .withUserConfiguration(JdbcObservationMetricsConfig.class)
                .withBean(PrometheusMeterRegistry.class,
                        () -> new PrometheusMeterRegistry(PrometheusConfig.DEFAULT))
                .withPropertyValues("spring.application.name=jarihana", "management.metrics.use-global-registry=false")
                .withInitializer(context -> propertySources.forEach(source ->
                        context.getEnvironment().getPropertySources().addLast(source)))
                .run(context -> {
                    PrometheusMeterRegistry registry = context.getBean(PrometheusMeterRegistry.class);
                    Timer timer = registry.timer("jdbc.query", "jdbc.datasource.name", "test");

                    // When
                    for (long millis : new long[] {99, 100, 101, 499, 500, 501, 999, 1000, 1001}) {
                        timer.record(Duration.ofMillis(millis));
                    }

                    // Then
                    assertThat(timer.count()).isEqualTo(9);
                    for (int index = 0; index < 3; index++) {
                        long boundary = new long[] {100, 500, 1000}[index];
                        long expectedCount = new long[] {2, 5, 8}[index];
                        assertThat(timer.takeSnapshot().histogramCounts())
                                .filteredOn(bucket -> bucket.bucket() == TimeUnit.MILLISECONDS.toNanos(boundary))
                                .singleElement()
                                .satisfies(bucket -> assertThat(bucket.count()).isEqualTo(expectedCount));
                    }
                    assertThat(registry.scrape()).contains("le=\"0.1\"", "le=\"0.5\"");
                    assertThat(registry.scrape()).contains("le=\"1.0\"");
                    assertThat(registry.scrape()).contains("environment=\"" + profile + "\"");
                });
    }
}

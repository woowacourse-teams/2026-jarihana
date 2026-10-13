package com.project.jarihana.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.Timer;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.health.contributor.Status;
import org.springframework.boot.jdbc.health.DataSourceHealthIndicator;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {
        "management.metrics.distribution.percentiles-histogram.jdbc.query=true",
        "management.metrics.tags.application=jarihana",
        "management.metrics.tags.environment=test"
})
class JdbcMetricsTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PrometheusMeterRegistry prometheusMeterRegistry;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private DataSourceHealthIndicator dataSourceHealthIndicator;

    @Test
    @DisplayName("JdbcTemplate 쿼리는 jdbc.query Prometheus 타이머 히스토그램으로 집계된다.")
    void jdbcTemplateQueryIsCollectedAsPrometheusTimerHistogram() {
        // Given
        int before = jdbcQueryCount();

        // When
        String value = jdbcTemplate.queryForObject("select ?::text", String.class, "metrics-test");

        // Then
        assertThat(value).isEqualTo("metrics-test");
        assertThat(jdbcQueryCount()).isGreaterThan(before);

        String scrape = prometheusMeterRegistry.scrape();
        assertThat(scrape).contains("jdbc_query_seconds_count{");
        assertThat(scrape).contains("jdbc_query_seconds_bucket{");
        assertThat(scrape).contains("application=\"jarihana\"");
        assertThat(scrape).contains("environment=\"test\"");
        assertThat(scrape).contains("jdbc_datasource_name=");
        assertThat(scrape).contains("hikaricp_connections_active{");
        assertThat(scrape).contains("hikaricp_connections_usage_seconds_count{");
        assertThat(scrape).doesNotContain("query=");
        assertThat(scrape).doesNotContain("SELECT 1");
        assertThat(scrape).doesNotContain("metrics-test");
        assertThat(scrape).doesNotContain("jdbc_connection_seconds");
        assertThat(scrape).doesNotContain("jdbc_connection_acquired_total");
        assertThat(scrape).doesNotContain("jdbc_resultset");
    }

    @Test
    @DisplayName("DataSource 계측 후에도 Actuator DB health check는 유지된다.")
    void dataSourceHealthCheckKeepsWorkingWithInstrumentedDataSource() {
        // When
        Status status = dataSourceHealthIndicator.health().getStatus();

        // Then
        assertThat(status).isEqualTo(Status.UP);
        assertThat(dataSourceHealthIndicator.getQuery()).isNull();
    }

    @Test
    @DisplayName("계측된 DataSource는 Hikari 풀 타입을 유지한다.")
    void instrumentedDataSourceKeepsHikariPoolCompatibility() throws Exception {
        assertThat(dataSource).isNotNull();
        assertThat(dataSource.toString()).contains("Hikari");
        assertThat(dataSource.isWrapperFor(HikariDataSource.class)).isTrue();
        assertThat(dataSource.unwrap(HikariDataSource.class)).isNotNull();
    }

    private int jdbcQueryCount() {
        Timer timer = prometheusMeterRegistry.find("jdbc.query").timer();
        if (timer == null) {
            return 0;
        }
        return (int) timer.count();
    }
}

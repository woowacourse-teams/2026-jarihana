package com.project.jarihana.common.config;

import io.micrometer.core.instrument.config.MeterFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JdbcObservationMetricsConfig {

    @Bean
    public MeterFilter jdbcObservationMeterFilter() {
        return MeterFilter.deny(id -> id.getName().equals("jdbc.connection")
                || id.getName().startsWith("jdbc.connection.")
                || id.getName().startsWith("jdbc.resultset."));
    }
}

package com.project.jarihana.rhythm.config;

import com.project.jarihana.rhythm.domain.RhythmChart;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

@Configuration
public class RhythmChartConfig {
    static final String CHART_RESOURCE = "rhythm-harpoon/ranked-chart.json";

    @Bean
    public RhythmChart rhythmChart(JsonMapper jsonMapper) {
        try (InputStream stream = new ClassPathResource(CHART_RESOURCE).getInputStream()) {
            return RhythmChartReader.read(jsonMapper, stream);
        } catch (IOException exception) {
            throw new UncheckedIOException("공식 도전 채보를 읽을 수 없습니다.", exception);
        }
    }
}

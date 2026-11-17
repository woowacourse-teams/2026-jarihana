package com.project.jarihana.rhythm.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.rhythm.config.RhythmChartReader;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

class RhythmEngineDeadAtTest {
    private static RhythmChart chart;

    @BeforeAll
    static void loadChart() throws IOException {
        try (InputStream stream = RhythmEngineDeadAtTest.class.getResourceAsStream("/rhythm-harpoon/ranked-chart.json")) {
            chart = RhythmChartReader.read(JsonMapper.builder().build(), stream);
        }
    }

    @Test
    @DisplayName("라이프를 모두 잃기 전에는 탈락 시각이 없고, 잃으면 마지막 피해를 받은 곡 시각을 알려 준다")
    void reportsTheSongTimeOfTheFinalDamage() {
        // Given
        RhythmEngine engine = RhythmEngine.start(chart, RhythmLevel.HARDEST, 1, 7);

        // When
        engine.play(List.of(), 2);
        boolean aliveEarly = engine.deadAt().isEmpty();
        engine.playUntilDead(2, 600);

        // Then
        assertThat(aliveEarly).isTrue();
        assertThat(engine.dead()).isTrue();
        assertThat(engine.deadAt()).isPresent();
        double deadAt = engine.deadAt().getAsDouble();
        assertThat(deadAt).isGreaterThan(2).isLessThan(600);

        // 같은 시드와 입력이면 탈락 시각도 같다.
        RhythmEngine replay = RhythmEngine.start(chart, RhythmLevel.HARDEST, 1, 7);
        replay.play(List.of(), deadAt + 1);
        assertThat(replay.deadAt()).hasValue(deadAt);
        RhythmEngine early = RhythmEngine.start(chart, RhythmLevel.HARDEST, 1, 7);
        early.play(List.of(), deadAt - 0.001);
        assertThat(early.dead()).isFalse();
    }
}

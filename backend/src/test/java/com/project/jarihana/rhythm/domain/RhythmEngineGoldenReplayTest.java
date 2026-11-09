package com.project.jarihana.rhythm.domain;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.rhythm.config.RhythmChartReader;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

class RhythmEngineGoldenReplayTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @TestFactory
    @DisplayName("프론트엔드 엔진이 만든 대조 입력을 같은 순서로 진행하면 점수, 라이프, 판정 수가 모두 같다")
    Stream<DynamicTest> replaysMatchFrontendEngine() throws IOException {
        // Given
        RhythmChart chart = chart();
        JsonNode golden = read("/rhythm-harpoon/golden-replays.json");
        assertThat(golden.get("rulesVersion").asString()).isEqualTo(chart.getRulesVersion());

        return golden.get("scenarios").valueStream().map(scenario -> DynamicTest.dynamicTest(
                scenario.get("name").asString(), () -> {
                    RhythmEngine engine = RhythmEngine.startAtLoop(chart,
                            RhythmLevel.from(scenario.get("level").asString()),
                            scenario.get("scrollSpeed").asDouble(),
                            scenario.get("seed").asInt(),
                            scenario.get("startLoop").asInt());

                    // When
                    for (JsonNode batch : scenario.get("batches")) {
                        List<RhythmInput> inputs = new ArrayList<>();
                        for (JsonNode input : batch.get("inputs")) {
                            inputs.add(RhythmInput.of(input.get(0).asInt(), input.get(1).asDouble()));
                        }
                        engine.play(inputs, batch.get("playedUntil").asDouble());
                    }

                    // Then
                    assertThat(summary(engine)).isEqualTo(expected(scenario.get("expected")));
                }));
    }

    @Test
    @DisplayName("시드가 같으면 루프마다 같은 방향 배치가 나오고 첫 루프는 기본 배치다")
    void sameSeedShufflesLoopsTheSameWay() throws IOException {
        // Given
        RhythmChart chart = chart();
        RhythmEngine first = RhythmEngine.start(chart, RhythmLevel.HARDEST, 1, 99);
        RhythmEngine second = RhythmEngine.start(chart, RhythmLevel.HARDEST, 1, 99);

        // When
        first.play(List.of(), 400);
        second.play(List.of(), 400);

        // Then
        assertThat(first.loopMaps()).isEqualTo(second.loopMaps());
        assertThat(first.loopMaps().getFirst()).containsExactly(RhythmLane.values());
    }

    private static RhythmChart chart() throws IOException {
        try (InputStream stream = RhythmEngineGoldenReplayTest.class.getResourceAsStream("/rhythm-harpoon/ranked-chart.json")) {
            return RhythmChartReader.read(JSON, stream);
        }
    }

    private static JsonNode read(String path) throws IOException {
        try (InputStream stream = RhythmEngineGoldenReplayTest.class.getResourceAsStream(path)) {
            return JSON.readTree(stream);
        }
    }

    private static Map<String, Object> summary(RhythmEngine engine) {
        RhythmScore score = engine.score();
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("score", score.score());
        values.put("lives", (long) engine.lives());
        values.put("combo", (long) engine.combo());
        values.put("bestCombo", (long) score.bestCombo());
        values.put("dead", engine.dead());
        values.put("loop", (long) score.loopReached());
        values.put("perfect", (long) score.perfect());
        values.put("hit", (long) score.hit());
        values.put("enough", (long) score.enough());
        values.put("uhoh", (long) score.uhoh());
        values.put("poor", (long) score.poor());
        values.put("miss", (long) score.miss());
        return values;
    }

    private static Map<String, Object> expected(JsonNode node) {
        Map<String, Object> values = new LinkedHashMap<>();
        for (String key : List.of("score", "lives", "combo", "bestCombo", "dead", "loop",
                "perfect", "hit", "enough", "uhoh", "poor", "miss")) {
            JsonNode value = node.get(key);
            values.put(key, value.isBoolean() ? value.asBoolean() : value.asLong());
        }
        return values;
    }
}

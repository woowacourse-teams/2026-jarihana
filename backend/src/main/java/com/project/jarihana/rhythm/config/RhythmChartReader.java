package com.project.jarihana.rhythm.config;

import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythm.domain.RhythmLane;
import com.project.jarihana.rhythm.domain.RhythmLevel;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code rhythm-harpoon/ranked-chart.json}을 공식 도전 채보로 읽는다.
 */
public final class RhythmChartReader {
    private RhythmChartReader() {
    }

    public static RhythmChart read(JsonMapper json, InputStream stream) {
        JsonNode root = json.readTree(stream);
        Map<RhythmLevel, RhythmChart.Level> levels = new EnumMap<>(RhythmLevel.class);
        for (RhythmLevel level : RhythmLevel.values()) {
            levels.put(level, level(root.required("levels").required(level.key())));
        }
        return RhythmChart.of(
                root.required("rulesVersion").asString(),
                root.required("chartVersion").asString(),
                root.required("bpm").asDouble(),
                root.required("sampleRateHz").asDouble(),
                root.required("durationSeconds").asDouble(),
                levels);
    }

    private static RhythmChart.Level level(JsonNode node) {
        List<RhythmChart.Event> events = new ArrayList<>();
        for (JsonNode event : node.required("events")) {
            List<RhythmLane> keys = new ArrayList<>();
            for (JsonNode key : event.get(2)) {
                keys.add(RhythmLane.from(key.asString()));
            }
            events.add(new RhythmChart.Event(event.get(0).asDouble(), event.get(1).asDouble(), keys));
        }
        Map<String, List<RhythmChart.Staircase>> staircases = new HashMap<>();
        for (Map.Entry<String, JsonNode> entry : node.required("staircases").properties()) {
            List<RhythmChart.Staircase> rotations = new ArrayList<>();
            for (JsonNode rotation : entry.getValue()) {
                rotations.add(new RhythmChart.Staircase(
                        rotation.get(0).asDouble(), rotation.get(1).asDouble(), rotation.get(2).asInt()));
            }
            staircases.put(entry.getKey(), rotations);
        }
        return new RhythmChart.Level(node.required("lives").asInt(), node.required("loopHeal").asInt(),
                node.required("speedUpFromLoop").asInt(), events, staircases, song(node.get("song")),
                node.has("loopSeamGuard") && node.get("loopSeamGuard").asBoolean());
    }

    // 원곡과 다른 곡을 치는 난이도만 곡 정보를 따로 갖는다.
    private static RhythmChart.Song song(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new RhythmChart.Song(node.required("chartVersion").asString(), node.required("bpm").asDouble(),
                node.required("sampleRateHz").asDouble(), node.required("durationSeconds").asDouble());
    }
}

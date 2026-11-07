package com.project.jarihana.rhythm.domain;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * 프론트엔드 엔진이 난이도별로 단순화한 공식 도전 채보다. 서버는 이 채보로 루프 배치와 판정만 다시 계산한다.
 * {@code frontend/scripts/export-rhythm-ranked-fixtures.mjs}가 만든 파일을 읽는다.
 */
public final class RhythmChart {
    private final String rulesVersion;
    private final String chartVersion;
    private final double bpm;
    private final double sampleRateHz;
    private final double durationSeconds;
    private final Map<RhythmLevel, Level> levels;

    private RhythmChart(String rulesVersion, String chartVersion, double bpm, double sampleRateHz,
            double durationSeconds, Map<RhythmLevel, Level> levels) {
        if (rulesVersion == null || rulesVersion.isBlank() || chartVersion == null || chartVersion.isBlank()) {
            throw new IllegalArgumentException("채보와 규칙 판본이 필요합니다.");
        }
        if (bpm <= 0 || sampleRateHz <= 0 || durationSeconds <= 0) {
            throw new IllegalArgumentException("채보의 빠르기와 길이가 올바르지 않습니다.");
        }
        EnumMap<RhythmLevel, Level> copy = new EnumMap<>(RhythmLevel.class);
        copy.putAll(levels);
        if (copy.size() != RhythmLevel.values().length) {
            throw new IllegalArgumentException("모든 난이도의 채보가 필요합니다.");
        }
        this.rulesVersion = rulesVersion;
        this.chartVersion = chartVersion;
        this.bpm = bpm;
        this.sampleRateHz = sampleRateHz;
        this.durationSeconds = durationSeconds;
        this.levels = copy;
    }

    public static RhythmChart of(String rulesVersion, String chartVersion, double bpm, double sampleRateHz,
            double durationSeconds, Map<RhythmLevel, Level> levels) {
        return new RhythmChart(rulesVersion, chartVersion, bpm, sampleRateHz, durationSeconds, levels);
    }

    public String getRulesVersion() {
        return rulesVersion;
    }

    public String getChartVersion() {
        return chartVersion;
    }

    double bpm() {
        return bpm;
    }

    double sampleRateHz() {
        return sampleRateHz;
    }

    double durationSeconds() {
        return durationSeconds;
    }

    Level level(RhythmLevel level) {
        return levels.get(level);
    }

    public record Event(int step, double sample, List<RhythmLane> keys) {
        public Event {
            keys = List.copyOf(keys);
            if (keys.isEmpty()) {
                throw new IllegalArgumentException("채보의 각 박에는 방향이 하나 이상 필요합니다.");
            }
        }
    }

    /**
     * 계단 구간의 노트는 루프 방향 배치 대신 원래 방향을 {@code shift}만큼 돌린다.
     */
    public record Staircase(int start, int end, int shift) {
    }

    /**
     * {@code staircases}의 키는 루프 방향 배치를 left, down, right, up 순서의 이름으로 이은 문자열이다.
     */
    public record Level(int lives, int loopHeal, List<Event> events, Map<String, List<Staircase>> staircases) {
        public Level {
            if (lives <= 0) {
                throw new IllegalArgumentException("라이프는 1개 이상이어야 합니다.");
            }
            if (loopHeal < 0 || loopHeal > lives) {
                throw new IllegalArgumentException("완주 충전량은 0 이상 최대 라이프 이하여야 합니다.");
            }
            events = List.copyOf(events);
            staircases = Map.copyOf(staircases);
        }

        List<Staircase> staircasesFor(List<RhythmLane> map) {
            String key = String.join(",", map.stream().map(RhythmLane::key).toList());
            return staircases.getOrDefault(key, List.of());
        }
    }
}

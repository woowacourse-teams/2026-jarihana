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
    private final Song song;
    private final Map<RhythmLevel, Level> levels;

    private RhythmChart(String rulesVersion, String chartVersion, double bpm, double sampleRateHz,
            double durationSeconds, Map<RhythmLevel, Level> levels) {
        if (rulesVersion == null || rulesVersion.isBlank()) {
            throw new IllegalArgumentException("채보와 규칙 판본이 필요합니다.");
        }
        EnumMap<RhythmLevel, Level> copy = new EnumMap<>(RhythmLevel.class);
        copy.putAll(levels);
        if (copy.size() != RhythmLevel.values().length) {
            throw new IllegalArgumentException("모든 난이도의 채보가 필요합니다.");
        }
        this.rulesVersion = rulesVersion;
        this.song = new Song(chartVersion, bpm, sampleRateHz, durationSeconds);
        this.levels = copy;
    }

    public static RhythmChart of(String rulesVersion, String chartVersion, double bpm, double sampleRateHz,
            double durationSeconds, Map<RhythmLevel, Level> levels) {
        return new RhythmChart(rulesVersion, chartVersion, bpm, sampleRateHz, durationSeconds, levels);
    }

    public String getRulesVersion() {
        return rulesVersion;
    }

    /**
     * 원곡의 채보 판본이다. 다른 곡을 치는 난이도는 {@link #chartVersion(RhythmLevel)}로 그 곡의 판본을 얻는다.
     */
    public String getChartVersion() {
        return song.chartVersion();
    }

    public String chartVersion(RhythmLevel level) {
        return song(level).chartVersion();
    }

    Song song(RhythmLevel level) {
        Song own = levels.get(level).song();
        return own == null ? song : own;
    }

    Level level(RhythmLevel level) {
        return levels.get(level);
    }

    /**
     * 난이도가 치는 곡의 채보 판본, 빠르기, 샘플레이트와 루프 길이다.
     */
    public record Song(String chartVersion, double bpm, double sampleRateHz, double durationSeconds) {
        public Song {
            if (chartVersion == null || chartVersion.isBlank()) {
                throw new IllegalArgumentException("채보와 규칙 판본이 필요합니다.");
            }
            if (bpm <= 0 || sampleRateHz <= 0 || durationSeconds <= 0) {
                throw new IllegalArgumentException("채보의 빠르기와 길이가 올바르지 않습니다.");
            }
        }
    }

    /**
     * 스윙 채보는 박을 셋으로 나눈 자리에 노트가 있어 step이 정수가 아니다.
     */
    public record Event(double step, double sample, List<RhythmLane> keys) {
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
    public record Staircase(double start, double end, int shift) {
    }

    /**
     * {@code staircases}의 키는 루프 방향 배치를 left, down, right, up 순서의 이름으로 이은 문자열이다.
     * {@code speedUpFromLoop}부터 곡 배속이 매 루프 0.05씩 오른다.
     * {@code song}이 없으면 원곡을 친다. {@code loopSeamGuard}면 마지막 노트와 다음 루프 첫 노트가 같은 방향에
     * 오지 않도록 다음 루프 배치를 다시 섞는다.
     */
    public record Level(int lives, int loopHeal, int speedUpFromLoop, List<Event> events,
                        Map<String, List<Staircase>> staircases, Song song, boolean loopSeamGuard) {
        public Level {
            if (lives <= 0) {
                throw new IllegalArgumentException("라이프는 1개 이상이어야 합니다.");
            }
            if (loopHeal < 0 || loopHeal > lives) {
                throw new IllegalArgumentException("완주 충전량은 0 이상 최대 라이프 이하여야 합니다.");
            }
            if (speedUpFromLoop < 1) {
                throw new IllegalArgumentException("가속 시작 루프는 1 이상이어야 합니다.");
            }
            if (events.isEmpty()) {
                throw new IllegalArgumentException("채보에는 노트가 하나 이상 필요합니다.");
            }
            events = List.copyOf(events);
            staircases = Map.copyOf(staircases);
        }

        public Level(int lives, int loopHeal, int speedUpFromLoop, List<Event> events,
                Map<String, List<Staircase>> staircases) {
            this(lives, loopHeal, speedUpFromLoop, events, staircases, null, false);
        }

        List<Staircase> staircasesFor(List<RhythmLane> map) {
            String key = String.join(",", map.stream().map(RhythmLane::key).toList());
            return staircases.getOrDefault(key, List.of());
        }
    }
}

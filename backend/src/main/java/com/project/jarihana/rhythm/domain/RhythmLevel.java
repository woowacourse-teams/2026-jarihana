package com.project.jarihana.rhythm.domain;

public enum RhythmLevel {
    EASY("easy"),
    MEDIUM("medium"),
    HARD("hard"),
    HARDEST("hardest"),
    // 스윙 편곡을 치는 번외 난이도다. 채보와 곡 정보는 ranked-chart.json의 각 난이도에 따로 있다.
    ANOTHER_HARD("anotherHard"),
    ANOTHER_HARDEST("anotherHardest");

    private final String key;

    RhythmLevel(String key) {
        this.key = key;
    }

    public static RhythmLevel from(String key) {
        for (RhythmLevel level : values()) {
            if (level.key.equals(key)) {
                return level;
            }
        }
        throw new IllegalArgumentException("알 수 없는 난이도입니다.");
    }

    public String key() {
        return key;
    }
}

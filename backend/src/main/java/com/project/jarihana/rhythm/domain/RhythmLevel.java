package com.project.jarihana.rhythm.domain;

public enum RhythmLevel {
    EASY("easy"),
    MEDIUM("medium"),
    HARD("hard"),
    HARDEST("hardest");

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

package com.project.jarihana.rhythm.domain;

import java.util.List;

/**
 * 프론트엔드 엔진의 {@code LANES} 순서(left, down, right, up)와 같은 순서다. 입력과 방향 배치는 이 순번으로 주고받는다.
 */
public enum RhythmLane {
    LEFT("left"),
    DOWN("down"),
    RIGHT("right"),
    UP("up");

    private static final List<RhythmLane> ORDER = List.of(values());

    private final String key;

    RhythmLane(String key) {
        this.key = key;
    }

    public static RhythmLane fromIndex(int index) {
        if (index < 0 || index >= ORDER.size()) {
            throw new IllegalArgumentException("알 수 없는 방향입니다.");
        }
        return ORDER.get(index);
    }

    public static RhythmLane from(String key) {
        for (RhythmLane lane : ORDER) {
            if (lane.key.equals(key)) {
                return lane;
            }
        }
        throw new IllegalArgumentException("알 수 없는 방향입니다.");
    }

    public String key() {
        return key;
    }

    RhythmLane rotate(int shift) {
        return ORDER.get((ordinal() + shift) % ORDER.size());
    }
}

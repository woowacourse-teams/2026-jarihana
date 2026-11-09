package com.project.jarihana.rhythm.domain;

/**
 * 곡 시작 기준 초 단위 시각에 누른 방향이다. 시각은 클라이언트가 입력 지연 보정을 적용한 값이다.
 */
public record RhythmInput(RhythmLane lane, double at) {
    public RhythmInput {
        if (lane == null || !Double.isFinite(at)) {
            throw new IllegalArgumentException("입력 방향과 시각이 필요합니다.");
        }
    }

    public static RhythmInput of(int laneIndex, double at) {
        return new RhythmInput(RhythmLane.fromIndex(laneIndex), at);
    }
}

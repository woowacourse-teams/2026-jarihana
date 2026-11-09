package com.project.jarihana.rhythm.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

class RhythmEngineLoopRechargeTest {
    private static final double START = 2;
    private static final double END = 6;

    @Test
    @DisplayName("완주하면 Hardest는 5개, 나머지는 3개를 충전하고 같은 완주에 두 번 지급하지 않는다")
    void completedLoopRechargesOnceForEachLevel() {
        for (RhythmLevel level : RhythmLevel.values()) {
            // Given
            int maximum = maximum(level);
            int reward = level == RhythmLevel.HARDEST ? 5 : 3;
            RhythmEngine engine = RhythmEngine.start(chart(6), level, 1, 99);

            // When
            engine.play(List.of(), END - 0.001);
            assertThat(engine.lives()).isEqualTo(maximum - 6);
            engine.play(List.of(), END);

            // Then
            assertThat(engine.lives()).isEqualTo(maximum - 6 + reward);
            engine.play(List.of(), END + 0.001);
            assertThat(engine.lives()).isEqualTo(maximum - 6 + reward);
            assertThat(engine.dead()).isFalse();
        }
    }

    @Test
    @DisplayName("완주 충전은 최대 라이프를 넘지 않고 미리 붙인 다음 루프에서 지급하지 않는다")
    void rechargeIsCappedAndNotGrantedByScheduling() {
        // Given
        RhythmEngine engine = RhythmEngine.start(chart(1), RhythmLevel.HARDEST, 1, 99);

        // When
        engine.play(List.of(), END - 0.001);

        // Then
        assertThat(engine.lives()).isEqualTo(9);
        engine.play(List.of(), END);
        assertThat(engine.lives()).isEqualTo(10);
    }

    @Test
    @DisplayName("늦게 받은 묶음도 이전 루프 피해, 완주 충전, 다음 루프 피해 순서로 계산한다")
    void delayedBatchOrdersDamageAndRechargeByTime() {
        // Given
        RhythmEngine engine = RhythmEngine.start(chart(6), RhythmLevel.HARDEST, 1, 99);

        // When
        engine.play(List.of(), END + RhythmEngine.CAPTURE_WINDOW + RhythmEngine.ATTACK_DURATION + 0.001);

        // Then
        assertThat(engine.lives()).isEqualTo(8);
        assertThat(engine.score().miss()).isEqualTo(7);
        assertThat(engine.dead()).isFalse();
    }

    @Test
    @DisplayName("완주 전에 라이프를 모두 잃으면 이후 경계를 지나도 부활하지 않는다")
    void fatalDamageBeforeCompletionCannotBeRecharged() {
        // Given
        RhythmEngine engine = RhythmEngine.start(chart(8), RhythmLevel.HARD, 1, 99);

        // When
        engine.play(List.of(), END + 0.5);

        // Then
        assertThat(engine.dead()).isTrue();
        assertThat(engine.lives()).isZero();
        engine.play(List.of(), END + 4);
        assertThat(engine.lives()).isZero();
    }

    @Test
    @DisplayName("빨라진 루프도 실제 종료 시각에 한 번 충전한다")
    void acceleratedLoopRechargesAtItsActualEnd() {
        // Given
        RhythmEngine engine = RhythmEngine.startAtLoop(chart(6), RhythmLevel.HARDEST, 1, 99, 6);
        double end = (START + 4) / RhythmEngine.rateForLoop(6);

        // When
        engine.play(List.of(), end - 0.001);
        assertThat(engine.lives()).isEqualTo(4);
        engine.play(List.of(), end);

        // Then
        assertThat(engine.lives()).isEqualTo(9);
    }

    private static int maximum(RhythmLevel level) {
        return level == RhythmLevel.EASY || level == RhythmLevel.HARDEST ? 10 : 8;
    }

    private static RhythmChart chart(int count) {
        List<RhythmChart.Event> events = IntStream.range(0, count)
                .mapToObj(index -> new RhythmChart.Event(index * 2, index * 250, List.of(RhythmLane.LEFT)))
                .toList();
        Map<RhythmLevel, RhythmChart.Level> levels = new EnumMap<>(RhythmLevel.class);
        for (RhythmLevel level : RhythmLevel.values()) {
            int reward = level == RhythmLevel.HARDEST ? 5 : 3;
            levels.put(level, new RhythmChart.Level(maximum(level), reward, events, Map.of()));
        }
        return RhythmChart.of("test-recharge", "test-chart", 120, 1000, 4, levels);
    }
}

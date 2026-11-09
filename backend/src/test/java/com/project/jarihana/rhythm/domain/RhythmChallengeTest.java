package com.project.jarihana.rhythm.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.rhythm.config.RhythmChartReader;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.List;

class RhythmChallengeTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 7, 12, 0);
    private static RhythmChart chart;

    @BeforeAll
    static void loadChart() throws IOException {
        try (InputStream stream = RhythmChallengeTest.class.getResourceAsStream("/rhythm-harpoon/ranked-chart.json")) {
            chart = RhythmChartReader.read(JsonMapper.builder().build(), stream);
        }
    }

    @Test
    @DisplayName("배속이 0.25 단위가 아니거나 범위를 벗어나면 도전을 만들 수 없다")
    void rejectsInvalidScrollSpeed() {
        // Given
        List<Double> invalid = List.of(0.75, 1.1, 3.25, Double.NaN);

        // When & Then
        for (double speed : invalid) {
            assertThatThrownBy(() -> RhythmChallenge.create(1, RhythmLevel.EASY, speed, 7, chart, NOW))
                    .isInstanceOf(BusinessException.class);
        }
        assertThat(RhythmChallenge.create(1, RhythmLevel.HARD, 2.75, 7, chart, NOW).getLives()).isEqualTo(8);
    }

    @Test
    @DisplayName("진행 시각이 실제 경과 시간보다 3초 넘게 앞서거나 15초 넘게 늦으면 무효 이유를 돌려준다")
    void detectsRunsThatDoNotFollowRealTime() {
        // Given
        RhythmChallenge playing = RhythmChallenge.create(1, RhythmLevel.EASY, 1, 7, chart, NOW).start(NOW);
        LocalDateTime later = NOW.plusSeconds(30);

        // When & Then
        assertThat(playing.checkBatch(1, 32.9, List.of(), later)).isNull();
        assertThat(playing.checkBatch(1, 33.1, List.of(), later)).isEqualTo(RhythmInvalidReason.CLOCK_AHEAD);
        assertThat(playing.checkBatch(1, 15.1, List.of(), later)).isNull();
        assertThat(playing.checkBatch(1, 14.9, List.of(), later)).isEqualTo(RhythmInvalidReason.LAGGED);
    }

    @Test
    @DisplayName("묶음은 다음 순번이어야 하고 입력 시각은 앞선 입력과 진행 시각 사이에 순서대로 있어야 한다")
    void rejectsOutOfOrderBatches() {
        // Given
        RhythmChallenge playing = RhythmChallenge.create(1, RhythmLevel.EASY, 1, 7, chart, NOW).start(NOW);
        LocalDateTime later = NOW.plusSeconds(4);
        RhythmInput early = RhythmInput.of(0, 1.0);
        RhythmInput late = RhythmInput.of(1, 2.0);

        // When & Then
        assertThatThrownBy(() -> playing.checkBatch(2, 3, List.of(), later)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> playing.checkBatch(1, 3, List.of(late, early), later))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> playing.checkBatch(1, 1.5, List.of(early, late), later))
                .isInstanceOf(BusinessException.class);
        RhythmEngine engine = playing.newEngine(chart);
        engine.play(List.of(early, late), 3);
        RhythmChallenge recorded = playing.record(1, 3, List.of(early, late), engine, later);
        assertThatThrownBy(() -> recorded.checkBatch(2, 4, List.of(RhythmInput.of(2, 1.5)), later))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> recorded.checkBatch(2, 2.9, List.of(), later)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("시작하지 않은 판은 5분, 진행 중 묶음이 끊긴 판은 30초 뒤 무효가 되고 끝난 판은 바뀌지 않는다")
    void expiresIdleChallenges() {
        // Given
        RhythmChallenge created = RhythmChallenge.create(1, RhythmLevel.EASY, 1, 7, chart, NOW);
        RhythmChallenge playing = created.start(NOW);

        // When
        RhythmChallenge expired = created.expire(NOW.plusMinutes(5));
        RhythmChallenge stale = playing.expire(NOW.plusSeconds(30));

        // Then
        assertThat(created.expire(NOW.plusMinutes(4))).isSameAs(created);
        assertThat(expired.getInvalidReason()).isEqualTo(RhythmInvalidReason.EXPIRED);
        assertThat(playing.expire(NOW.plusSeconds(29))).isSameAs(playing);
        assertThat(stale.getInvalidReason()).isEqualTo(RhythmInvalidReason.STALE);
        assertThat(stale.invalidate(RhythmInvalidReason.ABANDONED, NOW)).isSameAs(stale);
    }

    @Test
    @DisplayName("서버 계산에서 라이프를 모두 잃으면 기록으로 끝난다")
    void finishesWhenTheServerEngineRunsOutOfLives() {
        // Given
        RhythmChallenge playing = RhythmChallenge.create(1, RhythmLevel.EASY, 1, 7, chart, NOW).start(NOW);
        RhythmEngine engine = playing.newEngine(chart);

        // When
        engine.play(List.of(), 60);
        RhythmChallenge finished = playing.record(1, 60, List.of(), engine, NOW.plusSeconds(60));

        // Then
        assertThat(engine.dead()).isTrue();
        assertThat(finished.getStatus()).isEqualTo(RhythmChallengeStatus.FINISHED);
        assertThat(finished.getLives()).isZero();
        assertThat(finished.getMissCount()).isGreaterThanOrEqualTo(10);
        assertThat(finished.getFinishedAt()).isEqualTo(NOW.plusSeconds(60));
    }
}

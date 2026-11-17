package com.project.jarihana.rhythmbattle.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.rhythm.config.RhythmChartReader;
import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythm.domain.RhythmEngine;
import com.project.jarihana.rhythm.domain.RhythmInput;
import com.project.jarihana.rhythm.domain.RhythmLevel;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.List;

class RhythmBattleRunTest {
    private static final LocalDateTime STARTS_AT = LocalDateTime.of(2026, 11, 16, 12, 0, 5);
    private static RhythmChart chart;

    @BeforeAll
    static void loadChart() throws IOException {
        try (InputStream stream = RhythmBattleRunTest.class.getResourceAsStream("/rhythm-harpoon/ranked-chart.json")) {
            chart = RhythmChartReader.read(JsonMapper.builder().build(), stream);
        }
    }

    @Test
    @DisplayName("공통 시작 시각부터 실제로 흐른 시간과 진행 시각이 맞지 않으면 시각 위반 이유를 알려 준다")
    void checksProgressAgainstTheSharedStart() {
        // Given
        RhythmBattleRun run = run(RhythmLevel.EASY);

        // When & Then
        assertThat(run.checkBatch(1, 10, List.of(), STARTS_AT.plusSeconds(10))).isNull();
        assertThat(run.checkBatch(1, 14, List.of(), STARTS_AT.plusSeconds(10))).isEqualTo(BattleOutReason.CLOCK_AHEAD);
        assertThat(run.checkBatch(1, 4, List.of(), STARTS_AT.plusSeconds(20))).isEqualTo(BattleOutReason.LAGGED);
        assertThatThrownBy(() -> run.checkBatch(2, 1, List.of(), STARTS_AT.plusSeconds(1)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> run.checkBatch(1, 1, List.of(RhythmInput.of(0, 2)), STARTS_AT.plusSeconds(1)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("서버 계산에서 라이프를 모두 잃으면 탈락하고 탈락한 곡 시각을 남긴다")
    void recordsTheEliminationTime() {
        // Given
        RhythmBattleRun run = run(RhythmLevel.HARDEST);
        RhythmEngine engine = run.newEngine(chart);
        engine.play(List.of(), 300);

        // When
        RhythmBattleRun recorded = run.record(1, 300, List.of(), engine, STARTS_AT.plusSeconds(300));

        // Then
        assertThat(recorded.getStatus()).isEqualTo(BattleRunStatus.OUT);
        assertThat(recorded.getOutReason()).isEqualTo(BattleOutReason.ELIMINATED);
        assertThat(recorded.getOutAt()).isEqualTo(engine.deadAt().getAsDouble());
        assertThat(recorded.getLives()).isZero();
        assertThat(recorded.progress()).isEqualTo(
                BattleProgress.out(run.getMemberId(), BattleOutReason.ELIMINATED, recorded.getOutAt(), 300));
    }

    @Test
    @DisplayName("살아 있는 동안은 점수와 진행 시각을 남기고, 30초 동안 묶음이 없으면 연결이 끊긴 것으로 탈락한다")
    void recordsProgressAndExpiresStaleRuns() {
        // Given
        RhythmBattleRun run = run(RhythmLevel.EASY);
        RhythmEngine engine = run.newEngine(chart);
        engine.play(List.of(), 1);

        // When
        RhythmBattleRun recorded = run.record(1, 1, List.of(), engine, STARTS_AT.plusSeconds(1));

        // Then
        assertThat(recorded.getStatus()).isEqualTo(BattleRunStatus.PLAYING);
        assertThat(recorded.getLastSequence()).isEqualTo(1);
        assertThat(recorded.getPlayedUntil()).isEqualTo(1);
        assertThat(recorded.progress()).isEqualTo(BattleProgress.alive(run.getMemberId(), 1));
        assertThat(recorded.expire(STARTS_AT.plusSeconds(30))).isSameAs(recorded);
        RhythmBattleRun stale = recorded.expire(STARTS_AT.plusSeconds(31));
        assertThat(stale.getStatus()).isEqualTo(BattleRunStatus.OUT);
        assertThat(stale.getOutReason()).isEqualTo(BattleOutReason.STALE);
        assertThat(run.expire(STARTS_AT.plusSeconds(30)).getOutReason()).isEqualTo(BattleOutReason.STALE);
    }

    @Test
    @DisplayName("기권한 판은 다시 기권하거나 묶음을 받아도 바뀌지 않는다")
    void forfeitIsFinal() {
        // Given
        RhythmBattleRun forfeited = run(RhythmLevel.EASY).forfeit(BattleOutReason.ABANDONED, STARTS_AT);

        // When & Then
        assertThat(forfeited.forfeit(BattleOutReason.STALE, STARTS_AT)).isSameAs(forfeited);
        assertThat(forfeited.isOut()).isTrue();
        assertThatThrownBy(() -> forfeited.checkBatch(1, 1, List.of(), STARTS_AT.plusSeconds(1)))
                .isInstanceOf(BusinessException.class);
    }

    private static RhythmBattleRun run(RhythmLevel level) {
        return RhythmBattleRun.create(10, 1, 1, level, 1, 7, chart, STARTS_AT);
    }
}

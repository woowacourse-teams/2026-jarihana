package com.project.jarihana.minigame.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MinigameRunTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 11, 12, 0);
    private static final long SEED = 20261111L;

    @DisplayName("새 판은 1번 막대부터 시작하고 도전한 날짜를 기록한다.")
    @Test
    void startsAtFirstRound() {
        // When
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);

        // Then
        assertThat(run.currentRound()).isEqualTo(1);
        assertThat(run.getPlayedOn()).isEqualTo(NOW.toLocalDate());
        assertThat(run.finished()).isFalse();
        assertThat(run.currentPuzzle().cells()).isEqualTo(StickPuzzleGenerator.generate(SEED, 1).cells());
    }

    @DisplayName("막대를 자르면 점수와 걸린 시간을 더하고 다음 막대로 넘어간다.")
    @Test
    void recordsCutAndMovesToNextRound() {
        // Given
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);
        double answer = run.currentPuzzle().answerPosition();

        // When
        RoundCut cut = run.cut(1, answer, NOW.plusSeconds(12));

        // Then
        assertThat(cut.judgement().score()).isEqualTo(1_000);
        assertThat(cut.durationMillis()).isEqualTo(12_000);
        assertThat(cut.timedOut()).isFalse();
        assertThat(cut.run().currentRound()).isEqualTo(2);
        assertThat(cut.run().getTotalScore()).isEqualTo(1_000);
        assertThat(cut.run().getTotalDurationMillis()).isEqualTo(12_000);
        assertThat(cut.run().getRoundIssuedAt()).isEqualTo(NOW.plusSeconds(12));
        assertThat(run.currentRound()).isEqualTo(1);
    }

    @DisplayName("다섯 번째 막대를 자르면 판이 끝난다.")
    @Test
    void finishesAfterLastRound() {
        // Given
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);

        // When
        for (int round = 1; round <= StickPuzzleGenerator.ROUNDS; round++) {
            run = run.cut(round, 6, NOW.plusSeconds(round)).run();
        }

        // Then
        assertThat(run.finished()).isTrue();
        assertThat(run.getFinishedAt()).isEqualTo(NOW.plusSeconds(StickPuzzleGenerator.ROUNDS));
    }

    @DisplayName("지금 차례가 아닌 막대나 끝난 판은 자를 수 없다.")
    @Test
    void rejectsOutOfOrderCut() {
        // Given
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);

        // When & Then
        assertThatThrownBy(() -> run.cut(2, 6, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_ROUND_CONFLICT);

        MinigameRun finished = run;
        for (int round = 1; round <= StickPuzzleGenerator.ROUNDS; round++) {
            finished = finished.cut(round, 6, NOW).run();
        }
        MinigameRun ended = finished;
        assertThatThrownBy(() -> ended.cut(6, 6, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_ROUND_CONFLICT);
    }

    @DisplayName("제한 시간 30초에 여유 3초를 넘겨 자르면 0점이다.")
    @Test
    void scoresZeroAfterTimeLimit() {
        // Given
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);
        double answer = run.currentPuzzle().answerPosition();

        // When
        RoundCut inTime = run.cut(1, answer, NOW.plusSeconds(33));
        RoundCut late = run.cut(1, answer, NOW.plusSeconds(33).plusNanos(1_000_000));

        // Then
        assertThat(inTime.timedOut()).isFalse();
        assertThat(inTime.run().getTotalScore()).isEqualTo(1_000);
        assertThat(late.timedOut()).isTrue();
        assertThat(late.run().getTotalScore()).isZero();
    }

    private static Member member() {
        return Member.create("모카", 8, "minigame-run-member", Course.BACKEND);
    }
}

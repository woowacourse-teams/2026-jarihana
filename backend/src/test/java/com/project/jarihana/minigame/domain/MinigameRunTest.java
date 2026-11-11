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
        assertThat(cut.run().roundIssued()).isFalse();
        assertThat(run.currentRound()).isEqualTo(1);
    }

    @DisplayName("다섯 번째 막대를 자르면 판이 끝난다.")
    @Test
    void finishesAfterLastRound() {
        // Given
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);

        // When
        for (int round = 1; round <= StickPuzzleGenerator.ROUNDS; round++) {
            run = run.issueRound(round, NOW.plusSeconds(round)).cut(round, 6, NOW.plusSeconds(round)).run();
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
            finished = finished.issueRound(round, NOW).cut(round, 6, NOW).run();
        }
        MinigameRun ended = finished;
        assertThatThrownBy(() -> ended.cut(6, 6, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_ROUND_CONFLICT);
        assertThatThrownBy(() -> ended.issueRound(6, NOW))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_ROUND_CONFLICT);
    }

    @DisplayName("결과 화면에서 기다린 뒤 다음 막대를 받으면 그때부터 제한 시간을 잰다.")
    @Test
    void measuresNextRoundFromIssue() {
        // Given: 1번 막대를 5초에 자르고 결과 화면을 10초 본다.
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);
        MinigameRun afterFirst = run.cut(1, 6, NOW.plusSeconds(5)).run();
        assertThatThrownBy(() -> afterFirst.cut(2, 6, NOW.plusSeconds(15)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_ROUND_CONFLICT);

        // When: 15초에 다음 막대를 받고 25초 만에 정답을 자른다.
        MinigameRun issued = afterFirst.issueRound(2, NOW.plusSeconds(15));
        RoundCut second = issued.cut(2, issued.currentPuzzle().answerPosition(), NOW.plusSeconds(40));

        // Then
        assertThat(issued.roundEndsAt()).isEqualTo(NOW.plusSeconds(15).plus(MinigameRun.ROUND_TIME_LIMIT));
        assertThat(second.timedOut()).isFalse();
        assertThat(second.durationMillis()).isEqualTo(25_000);
        assertThat(second.score()).isEqualTo(1_000);
    }

    @DisplayName("이미 받은 막대를 다시 받으면 처음 받은 시각을 그대로 둔다.")
    @Test
    void keepsFirstIssueTime() {
        // Given
        MinigameRun afterFirst = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW)
                .cut(1, 6, NOW.plusSeconds(5)).run();
        MinigameRun issued = afterFirst.issueRound(2, NOW.plusSeconds(10));

        // When
        MinigameRun again = issued.issueRound(2, NOW.plusSeconds(20));

        // Then
        assertThat(again).isSameAs(issued);
        assertThat(again.roundEndsAt()).isEqualTo(NOW.plusSeconds(10).plus(MinigameRun.ROUND_TIME_LIMIT));
    }

    @DisplayName("시작 후 10분이 지나면 다음 막대를 받을 수 없고, 마지막 막대를 하루 뒤에 잘라도 기록되지 않는다.")
    @Test
    void expiresRunAfterTimeLimit() {
        // Given: 4개를 정확히 자른다.
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);
        for (int round = 1; round <= 4; round++) {
            MinigameRun issued = run.issueRound(round, NOW.plusSeconds(round));
            run = issued.cut(round, issued.currentPuzzle().answerPosition(), NOW.plusSeconds(round)).run();
        }
        MinigameRun beforeLast = run;
        MinigameRun lastIssued = beforeLast.issueRound(5, NOW.plusSeconds(10));

        // When & Then
        assertThat(beforeLast.getTotalScore()).isEqualTo(4_000);
        assertThatThrownBy(() -> beforeLast.issueRound(5, NOW.plus(MinigameRun.RUN_TIME_LIMIT).plusSeconds(1)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_RUN_EXPIRED);
        assertThatThrownBy(() -> lastIssued.cut(5, 6, NOW.plusDays(1)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_RUN_EXPIRED);
    }

    @DisplayName("기한 직전에 받은 막대는 기한이 지나도 그 막대의 제한 시간 안이면 잘라서 판을 끝낼 수 있다.")
    @Test
    void finishesLastRoundIssuedBeforeDeadline() {
        // Given: 마지막 막대를 기한 10초 전에 받는다.
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);
        for (int round = 1; round <= 4; round++) {
            run = run.issueRound(round, NOW.plusSeconds(round)).cut(round, 6, NOW.plusSeconds(round)).run();
        }
        LocalDateTime deadline = NOW.plus(MinigameRun.RUN_TIME_LIMIT);
        LocalDateTime issuedAt = deadline.minusSeconds(10);
        MinigameRun lastIssued = run.issueRound(5, issuedAt);
        double answer = lastIssued.currentPuzzle().answerPosition();
        LocalDateTime roundEnd = issuedAt.plus(MinigameRun.ROUND_TIME_LIMIT);

        // When: 판 기한은 지났지만 그 막대의 제한 시간 끝에 자른다.
        RoundCut inTime = lastIssued.cut(5, answer, roundEnd);

        // Then
        assertThat(inTime.timedOut()).isFalse();
        assertThat(inTime.run().finished()).isTrue();
        assertThat(inTime.run().getFinishedAt()).isEqualTo(roundEnd);
        assertThatThrownBy(() -> lastIssued.cut(5, answer,
                roundEnd.plus(MinigameRun.SUBMIT_GRACE).plusNanos(1_000_000)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.MINIGAME_RUN_EXPIRED);
    }

    @DisplayName("제한 시간 60초에 여유 3초를 넘겨 자르면 0점이다.")
    @Test
    void scoresZeroAfterTimeLimit() {
        // Given
        MinigameRun run = MinigameRun.start(MinigameEvent.PEPERO_DAY_2026, member(), SEED, NOW);
        double answer = run.currentPuzzle().answerPosition();

        // When
        LocalDateTime lastMoment = NOW.plus(MinigameRun.ROUND_TIME_LIMIT).plus(MinigameRun.SUBMIT_GRACE);
        RoundCut inTime = run.cut(1, answer, lastMoment);
        RoundCut late = run.cut(1, answer, lastMoment.plusNanos(1_000_000));

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

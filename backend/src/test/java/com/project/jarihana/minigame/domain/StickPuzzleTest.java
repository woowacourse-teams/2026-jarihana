package com.project.jarihana.minigame.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StickPuzzleTest {

    @DisplayName("0.5cm 칸마다 초코 두께에 따라 무게를 더한다.")
    @Test
    void weighsEachCellByChocolateLevel() {
        // Given
        StickPuzzle puzzle = StickPuzzle.of(cells(6, ChocolateLevel.NONE, 18, ChocolateLevel.THICK), List.of(), 6);

        // When
        int total = puzzle.totalMilligrams();
        double left = puzzle.leftMilligrams(6.75);

        // Then
        assertThat(total).isEqualTo(4_200);
        assertThat(left).isCloseTo(2_100, within(1e-9));
    }

    @DisplayName("아몬드는 자른 위치보다 왼쪽에 있을 때만 왼쪽 무게에 더한다.")
    @Test
    void addsAlmondOnlyWhenLeftOfCut() {
        // Given
        StickPuzzle puzzle = StickPuzzle.of(
                cells(24, ChocolateLevel.THIN),
                List.of(Almond.of(3, AlmondSize.LARGE)),
                6
        );

        // When
        double beforeAlmond = puzzle.leftMilligrams(1.75);
        double afterAlmond = puzzle.leftMilligrams(1.76);

        // Then
        assertThat(beforeAlmond).isCloseTo(525, within(1e-9));
        assertThat(afterAlmond).isCloseTo(528 + 100, within(1e-9));
    }

    @DisplayName("정답 위치는 양쪽 무게가 같아지는 곳이다.")
    @Test
    void findsPositionWhereBothSidesWeighTheSame() {
        // Given
        StickPuzzle puzzle = StickPuzzle.of(cells(6, ChocolateLevel.NONE, 18, ChocolateLevel.THICK), List.of(), 6);

        // When
        double answer = puzzle.answerPosition();

        // Then
        assertThat(answer).isCloseTo(6.75, within(1e-9));
        assertThat(puzzle.errorRateAt(answer)).isCloseTo(0, within(1e-9));
    }

    @DisplayName("오차 2.5%까지는 1000점에서 750점으로 가파르게, 그 뒤로는 25%에서 0점이 되도록 완만하게 깎는다.")
    @Test
    void scoresByErrorRate() {
        // Given: 과자만 있는 막대라 1cm 어긋날 때마다 오차가 1/6씩 는다.
        StickPuzzle puzzle = StickPuzzle.of(cells(24, ChocolateLevel.NONE), List.of(), 6);

        // When
        CutJudgement exact = puzzle.judge(6);
        CutJudgement knee = puzzle.judge(6.15);
        CutJudgement fivePercent = puzzle.judge(6.3);
        CutJudgement tenPercent = puzzle.judge(6.6);
        CutJudgement farOff = puzzle.judge(7.5);

        // Then
        assertThat(exact.score()).isEqualTo(1_000);
        assertThat(knee.errorRate()).isCloseTo(0.025, within(1e-9));
        assertThat(knee.score()).isEqualTo(750);
        assertThat(fivePercent.score()).isEqualTo(667);
        assertThat(tenPercent.score()).isEqualTo(500);
        assertThat(farOff.errorRate()).isCloseTo(0.25, within(1e-9));
        assertThat(farOff.score()).isZero();
        assertThat(farOff.answerPosition()).isCloseTo(6, within(1e-9));
    }

    @DisplayName("프론트 연습 모드와 같은 점수표를 쓴다.")
    @Test
    void matchesPracticeScoreTable() {
        assertThat(StickPuzzle.scoreOf(0)).isEqualTo(1_000);
        assertThat(StickPuzzle.scoreOf(0.01)).isEqualTo(900);
        assertThat(StickPuzzle.scoreOf(0.025)).isEqualTo(750);
        assertThat(StickPuzzle.scoreOf(0.05)).isEqualTo(667);
        assertThat(StickPuzzle.scoreOf(0.1)).isEqualTo(500);
        assertThat(StickPuzzle.scoreOf(0.15)).isEqualTo(333);
        assertThat(StickPuzzle.scoreOf(0.25)).isZero();
        assertThat(StickPuzzle.scoreOf(0.4)).isZero();
    }

    private static List<ChocolateLevel> cells(int count, ChocolateLevel level) {
        return new ArrayList<>(Collections.nCopies(count, level));
    }

    private static List<ChocolateLevel> cells(int firstCount, ChocolateLevel first, int secondCount, ChocolateLevel second) {
        List<ChocolateLevel> cells = cells(firstCount, first);
        cells.addAll(Collections.nCopies(secondCount, second));
        return cells;
    }
}

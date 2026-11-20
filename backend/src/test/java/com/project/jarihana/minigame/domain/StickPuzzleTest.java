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

    @DisplayName("오차가 0%면 1000점, 10% 이상이면 0점으로 직선으로 깎는다.")
    @Test
    void scoresByErrorRate() {
        // Given
        StickPuzzle puzzle = StickPuzzle.of(cells(24, ChocolateLevel.NONE), List.of(), 6);

        // When
        CutJudgement exact = puzzle.judge(6);
        CutJudgement halfOff = puzzle.judge(6.15);
        CutJudgement farOff = puzzle.judge(7);

        // Then
        assertThat(exact.score()).isEqualTo(1_000);
        assertThat(halfOff.errorRate()).isCloseTo(0.025, within(1e-9));
        assertThat(halfOff.score()).isEqualTo(750);
        assertThat(farOff.score()).isZero();
        assertThat(farOff.answerPosition()).isCloseTo(6, within(1e-9));
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

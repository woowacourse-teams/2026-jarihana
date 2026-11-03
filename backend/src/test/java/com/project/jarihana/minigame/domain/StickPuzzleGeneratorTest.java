package com.project.jarihana.minigame.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class StickPuzzleGeneratorTest {

    @DisplayName("같은 seed와 막대 번호는 언제나 같은 막대를 만든다.")
    @Test
    void sameSeedAndRoundMakeSamePuzzle() {
        // When
        StickPuzzle first = StickPuzzleGenerator.generate(20261111L, 3);
        StickPuzzle second = StickPuzzleGenerator.generate(20261111L, 3);

        // Then
        assertThat(first.cells()).isEqualTo(second.cells());
        assertThat(first.almonds()).isEqualTo(second.almonds());
        assertThat(first.startPosition()).isEqualTo(second.startPosition());
    }

    @DisplayName("정답은 막대의 30~70% 안에 있고, 가운데에서 2% 이상 떨어지며, 아몬드 위에 오지 않는다.")
    @Test
    void everyPuzzleHasFairAnswer() {
        for (long seed = 1; seed <= 300; seed++) {
            for (int round = 1; round <= StickPuzzleGenerator.ROUNDS; round++) {
                // When
                StickPuzzle puzzle = StickPuzzleGenerator.generate(seed * 7_919, round);
                double ratio = puzzle.answerPosition() / StickPuzzle.LENGTH_CM;

                // Then
                assertThat(ratio).isBetween(0.3, 0.7);
                assertThat(Math.abs(ratio - 0.5)).isGreaterThanOrEqualTo(0.02);
                assertThat(puzzle.errorRateAt(puzzle.answerPosition())).isLessThan(1e-6);
            }
        }
    }

    @DisplayName("아몬드는 4번 막대부터 나오고 초코가 발린 칸에만 붙는다.")
    @Test
    void almondsAppearFromToppingRoundOnChocolate() {
        for (long seed = 1; seed <= 200; seed++) {
            for (int round = 1; round <= StickPuzzleGenerator.ROUNDS; round++) {
                // When
                StickPuzzle puzzle = StickPuzzleGenerator.generate(seed, round);

                // Then
                if (round <= 3) {
                    assertThat(puzzle.almonds()).isEmpty();
                    continue;
                }
                assertThat(puzzle.almonds()).allSatisfy(almond ->
                        assertThat(puzzle.cells().get(almond.cell())).isNotEqualTo(ChocolateLevel.NONE));
            }
        }
    }

    @DisplayName("칼 시작 위치는 막대 길이의 35~65% 안이다.")
    @Test
    void startPositionStaysNearMiddle() {
        for (long seed = 1; seed <= 200; seed++) {
            // When
            StickPuzzle puzzle = StickPuzzleGenerator.generate(seed, 1);

            // Then
            assertThat(puzzle.startPosition() / StickPuzzle.LENGTH_CM).isBetween(0.35, 0.65);
        }
    }
}

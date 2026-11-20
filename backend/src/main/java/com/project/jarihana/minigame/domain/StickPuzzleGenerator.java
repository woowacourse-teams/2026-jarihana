package com.project.jarihana.minigame.domain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.SplittableRandom;

/**
 * seed와 막대 번호로 막대를 만든다. 같은 입력은 언제나 같은 막대를 만들어, 서버가 막대를 저장하지 않고도
 * 판정할 때 다시 만들 수 있다.
 *
 * <p>막대 번호가 커질수록 초코 무늬가 복잡해진다. 1번 기본, 2번 얼룩, 3번 두께 섞임, 4번 토핑, 5번 종합이다.
 */
public final class StickPuzzleGenerator {

    public static final int ROUNDS = 5;

    private static final int MAX_TRIES = 400;
    private static final long ROUND_MIXER = 0x9E3779B97F4A7C15L;
    private static final double MIN_ANSWER_RATIO = 0.3;
    private static final double MAX_ANSWER_RATIO = 0.7;
    private static final double MIN_DISTANCE_FROM_MIDDLE = 0.02;
    private static final double MAX_ERROR_AT_ANSWER = 1e-6;

    private StickPuzzleGenerator() {
    }

    public static StickPuzzle generate(long seed, int round) {
        SplittableRandom random = new SplittableRandom(seed ^ (round * ROUND_MIXER));
        for (int attempt = 0; attempt < MAX_TRIES; attempt++) {
            StickPuzzle candidate = new Draft(random, round).build();
            if (isFair(candidate)) {
                return candidate;
            }
        }
        return fallback();
    }

    private static boolean isFair(StickPuzzle puzzle) {
        double answer = puzzle.answerPosition();
        double ratio = answer / StickPuzzle.LENGTH_CM;
        return ratio >= MIN_ANSWER_RATIO
                && ratio <= MAX_ANSWER_RATIO
                && Math.abs(ratio - 0.5) >= MIN_DISTANCE_FROM_MIDDLE
                && puzzle.errorRateAt(answer) < MAX_ERROR_AT_ANSWER;
    }

    /**
     * 정답이 6.75cm인 기본 막대다. 무늬를 400번 뽑아도 조건에 맞지 않을 때만 쓴다.
     */
    private static StickPuzzle fallback() {
        List<ChocolateLevel> cells = new ArrayList<>(Collections.nCopies(6, ChocolateLevel.NONE));
        cells.addAll(Collections.nCopies(18, ChocolateLevel.THICK));
        return StickPuzzle.of(cells, List.of(), StickPuzzle.LENGTH_CM / 2);
    }

    private static final class Draft {

        private final SplittableRandom random;
        private final int round;
        private final ChocolateLevel[] cells = new ChocolateLevel[StickPuzzle.CELLS];
        private final List<Almond> almonds = new ArrayList<>();
        private int coatedArea;

        private Draft(SplittableRandom random, int round) {
            this.random = random;
            this.round = round;
            Arrays.fill(cells, ChocolateLevel.NONE);
            this.coatedArea = StickPuzzle.CELLS - between(3, 6);
        }

        private StickPuzzle build() {
            decorate();
            List<ChocolateLevel> levels = new ArrayList<>(List.of(cells));
            List<Almond> placed = new ArrayList<>(almonds);
            if (random.nextBoolean()) {
                Collections.reverse(levels);
                placed = placed.stream()
                        .map(almond -> Almond.of(StickPuzzle.CELLS - 1 - almond.cell(), almond.size()))
                        .toList();
            }
            double start = uniform(0.35, 0.65) * StickPuzzle.LENGTH_CM;
            return StickPuzzle.of(levels, placed, start);
        }

        private void decorate() {
            if (round == 1) {
                singleCoat();
                return;
            }
            if (round == 2) {
                patches();
                return;
            }
            if (round == 3) {
                drips();
                return;
            }
            if (round == 4) {
                patches();
                addAlmonds(3, 5);
                return;
            }
            drips();
            addGaps();
            addAlmonds(2, 4);
        }

        private void singleCoat() {
            coatedArea = between(14, 20);
            coat(0, coatedArea, pickLevel());
        }

        private void patches() {
            int count = between(2, 3);
            for (int index = 0; index < count; index++) {
                int width = between(2, 6);
                int start = between(0, coatedArea - width);
                coat(start, start + width, pickLevel());
            }
        }

        private void drips() {
            double[] centers = new double[3];
            double[] spreads = new double[3];
            double[] heights = new double[3];
            for (int index = 0; index < 3; index++) {
                centers[index] = uniform(0, coatedArea * StickPuzzle.CELL_CM);
                spreads[index] = uniform(0.6, 2.4);
                heights[index] = uniform(0.3, 1);
            }
            for (int cell = 0; cell < coatedArea; cell++) {
                double x = (cell + 0.5) * StickPuzzle.CELL_CM;
                double thickness = 0;
                for (int index = 0; index < 3; index++) {
                    double distance = x - centers[index];
                    thickness += heights[index] * Math.exp(-(distance * distance) / (2 * spreads[index] * spreads[index]));
                }
                cells[cell] = toLevel(thickness);
            }
        }

        private void addGaps() {
            int count = between(1, 2);
            for (int index = 0; index < count; index++) {
                int width = between(1, 2);
                int start = between(0, coatedArea - width);
                for (int cell = start; cell < start + width; cell++) {
                    cells[cell] = ChocolateLevel.NONE;
                }
            }
        }

        private void addAlmonds(int min, int max) {
            List<Integer> coated = new ArrayList<>();
            for (int cell = 0; cell < StickPuzzle.CELLS; cell++) {
                if (cells[cell] != ChocolateLevel.NONE) {
                    coated.add(cell);
                }
            }
            if (coated.isEmpty()) {
                return;
            }
            int count = between(min, max);
            Set<Integer> used = new HashSet<>();
            for (int index = 0; index < count; index++) {
                int cell = coated.get(between(0, coated.size() - 1));
                AlmondSize size = random.nextBoolean() ? AlmondSize.SMALL : AlmondSize.LARGE;
                if (used.add(cell)) {
                    almonds.add(Almond.of(cell, size));
                }
            }
        }

        private void coat(int from, int to, ChocolateLevel level) {
            for (int cell = from; cell < to; cell++) {
                if (level.ordinal() > cells[cell].ordinal()) {
                    cells[cell] = level;
                }
            }
        }

        private ChocolateLevel pickLevel() {
            return random.nextBoolean() ? ChocolateLevel.THIN : ChocolateLevel.THICK;
        }

        private static ChocolateLevel toLevel(double thickness) {
            if (thickness < 0.15) {
                return ChocolateLevel.NONE;
            }
            if (thickness < 0.6) {
                return ChocolateLevel.THIN;
            }
            return ChocolateLevel.THICK;
        }

        private int between(int min, int max) {
            return min + random.nextInt(max - min + 1);
        }

        private double uniform(double min, double max) {
            return min + (max - min) * random.nextDouble();
        }
    }
}

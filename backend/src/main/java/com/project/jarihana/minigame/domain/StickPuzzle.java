package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.util.List;
import java.util.Objects;

/**
 * 반 나누기 게임의 막대 하나다. 길이 12cm를 0.5cm 칸 24개로 나누고, 칸마다 초코 두께를 정한다.
 * 왼쪽 끝을 0cm로 두고 자른 위치를 cm로 받는다.
 */
public final class StickPuzzle {

    public static final double LENGTH_CM = 12;
    public static final int CELLS = 24;
    public static final double CELL_CM = LENGTH_CM / CELLS;
    public static final int MAX_SCORE = 1_000;
    public static final double ZERO_SCORE_ERROR_RATE = 0.1;

    private static final int ANSWER_SEARCH_STEPS = 60;

    private final List<ChocolateLevel> cells;
    private final List<Almond> almonds;
    private final double startPosition;

    private StickPuzzle(List<ChocolateLevel> cells, List<Almond> almonds, double startPosition) {
        if (cells == null || cells.size() != CELLS || cells.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "막대 칸은 24개여야 합니다.");
        }
        if (almonds == null || almonds.stream().anyMatch(Objects::isNull)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아몬드 목록이 올바르지 않습니다.");
        }
        if (startPosition < 0 || startPosition > LENGTH_CM) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "칼 시작 위치가 막대 밖입니다.");
        }
        this.cells = List.copyOf(cells);
        this.almonds = List.copyOf(almonds);
        this.startPosition = startPosition;
    }

    public static StickPuzzle of(List<ChocolateLevel> cells, List<Almond> almonds, double startPosition) {
        return new StickPuzzle(cells, almonds, startPosition);
    }

    public int totalMilligrams() {
        int cellWeight = cells.stream().mapToInt(ChocolateLevel::milligramsPerCell).sum();
        int almondWeight = almonds.stream().mapToInt(almond -> almond.size().milligrams()).sum();
        return cellWeight + almondWeight;
    }

    /**
     * 자른 위치보다 왼쪽에 있는 무게다. 칸은 걸친 비율만큼 나누고, 아몬드는 자른 위치보다 왼쪽일 때만 더한다.
     */
    public double leftMilligrams(double position) {
        int fullCells = (int) Math.min(CELLS, Math.max(0, Math.floor(position / CELL_CM)));
        double weight = 0;
        for (int index = 0; index < fullCells; index++) {
            weight += cells.get(index).milligramsPerCell();
        }
        if (fullCells < CELLS) {
            double covered = (position - fullCells * CELL_CM) / CELL_CM;
            weight += cells.get(fullCells).milligramsPerCell() * Math.max(0, covered);
        }
        for (Almond almond : almonds) {
            if (almond.positionCm() < position) {
                weight += almond.size().milligrams();
            }
        }
        return weight;
    }

    public double errorRateAt(double position) {
        int total = totalMilligrams();
        return Math.abs(2 * leftMilligrams(position) - total) / total;
    }

    public double answerPosition() {
        double low = 0;
        double high = LENGTH_CM;
        double half = totalMilligrams() / 2.0;
        for (int step = 0; step < ANSWER_SEARCH_STEPS; step++) {
            double middle = (low + high) / 2;
            if (leftMilligrams(middle) < half) {
                low = middle;
            } else {
                high = middle;
            }
        }
        return (low + high) / 2;
    }

    public CutJudgement judge(double position) {
        double errorRate = errorRateAt(position);
        int score = (int) Math.round(MAX_SCORE * Math.max(0, 1 - errorRate / ZERO_SCORE_ERROR_RATE));
        return new CutJudgement(errorRate, score, answerPosition());
    }

    public List<ChocolateLevel> cells() {
        return cells;
    }

    public List<Almond> almonds() {
        return almonds;
    }

    public double startPosition() {
        return startPosition;
    }
}

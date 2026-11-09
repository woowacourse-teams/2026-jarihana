package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.util.Objects;

/**
 * 막대 칸 하나의 가운데에 붙은 아몬드다. 무게는 그 위치 한 점에 있다고 본다.
 */
public final class Almond {

    private final int cell;
    private final AlmondSize size;

    private Almond(int cell, AlmondSize size) {
        if (cell < 0 || cell >= StickPuzzle.CELLS) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아몬드 위치가 막대 밖입니다.");
        }
        if (size == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "아몬드 크기는 필수입니다.");
        }
        this.cell = cell;
        this.size = size;
    }

    public static Almond of(int cell, AlmondSize size) {
        return new Almond(cell, size);
    }

    public int cell() {
        return cell;
    }

    public AlmondSize size() {
        return size;
    }

    public double positionCm() {
        return (cell + 0.5) * StickPuzzle.CELL_CM;
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) {
            return true;
        }
        if (!(other instanceof Almond almond)) {
            return false;
        }
        return cell == almond.cell && size == almond.size;
    }

    @Override
    public int hashCode() {
        return Objects.hash(cell, size);
    }
}

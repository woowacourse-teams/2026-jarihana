package com.project.jarihana.minigame.domain;

/**
 * 막대 0.5cm 칸 하나에 발린 초코 두께다. 무게는 속의 과자를 포함한 칸 하나의 무게다.
 */
public enum ChocolateLevel {
    NONE(100),
    THIN(150),
    THICK(200);

    private final int milligramsPerCell;

    ChocolateLevel(int milligramsPerCell) {
        this.milligramsPerCell = milligramsPerCell;
    }

    public int milligramsPerCell() {
        return milligramsPerCell;
    }
}

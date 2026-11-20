package com.project.jarihana.minigame.domain;

public enum AlmondSize {
    SMALL(50),
    LARGE(100);

    private final int milligrams;

    AlmondSize(int milligrams) {
        this.milligrams = milligrams;
    }

    public int milligrams() {
        return milligrams;
    }
}

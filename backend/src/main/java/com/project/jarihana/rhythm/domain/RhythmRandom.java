package com.project.jarihana.rhythm.domain;

/**
 * 프론트엔드 {@code createSeededRandom}과 같은 32비트 LCG다. int 곱셈과 덧셈의 넘침이 JS의
 * {@code Math.imul}과 {@code >>> 0}처럼 2^32로 나눈 나머지가 되므로 같은 수열을 만든다.
 */
final class RhythmRandom {
    private static final double UNSIGNED_RANGE = 4294967296.0;

    private int value;

    RhythmRandom(int seed) {
        this.value = seed;
    }

    double next() {
        value = 1664525 * value + 1013904223;
        return Integer.toUnsignedLong(value) / UNSIGNED_RANGE;
    }
}

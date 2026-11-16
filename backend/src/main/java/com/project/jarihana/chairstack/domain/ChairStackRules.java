package com.project.jarihana.chairstack.domain;

import java.util.List;

public final class ChairStackRules {

    public static final int MAX_CHAIRS = 100;
    public static final int AIM_LIMIT = 18;
    public static final int SCALE = 100;

    private static final List<Chair> MIDDLE = List.of(
            Chair.MEDIUM, Chair.LEFT, Chair.SMALL, Chair.MEDIUM, Chair.RIGHT, Chair.SMALL);
    private static final List<Chair> HIGH = List.of(
            Chair.WIDE, Chair.TIGHT_LEFT, Chair.TINY, Chair.MEDIUM, Chair.TIGHT_RIGHT, Chair.TINY,
            Chair.MEDIUM, Chair.TIGHT_LEFT, Chair.TINY, Chair.WIDE, Chair.TIGHT_RIGHT, Chair.TINY);

    private ChairStackRules() {
    }

    public static Chair chair(int index) {
        if (index < 5) {
            return Chair.WIDE;
        }
        if (index < 23) {
            return MIDDLE.get((index - 5) % MIDDLE.size());
        }
        return HIGH.get((index - 23) % HIGH.size());
    }

    public static Motion motion(int height, int stress) {
        int heightSway = height < 15 ? 0 : Math.min(350, 65 + (height - 15) * 5);
        int amplitude = height < 5 ? 0 : heightSway + stress;
        return new Motion(amplitude, Math.max(1800, 2800 - Math.max(0, height - 15) * 16), 360);
    }

    public static Drop drop(List<Integer> placements, int stress, int aim, int releasePhase) {
        int height = placements.size();
        var motion = motion(height, stress);
        int position = aim * SCALE - motion.offsetAt(releasePhase + motion.fallMs());
        int failure = unstableLayer(placements, position);
        if (failure != 0) {
            return new Drop(position, stress, failure);
        }

        int supportCenter = height == 0 ? 0
                : placements.getLast() + chair(height - 1).supportCenter() * SCALE;
        int error = Math.abs(position - supportCenter);
        int nextStress = error <= SCALE
                ? Math.max(0, stress - (90 - error / 2))
                : Math.min(300, stress + (error - SCALE) / 3);
        return new Drop(position, nextStress, null);
    }

    private static int unstableLayer(List<Integer> placements, int position) {
        int height = placements.size();
        int mass = 0;
        int moment = 0;
        for (int layer = height; layer >= 0; layer--) {
            var current = chair(layer);
            int x = layer == height ? position : placements.get(layer);
            int halfFoot = (current.width() / 2 - 1) * SCALE;
            var below = layer == 0 ? null : chair(layer - 1);
            int supportX = layer == 0 ? 0 : placements.get(layer - 1);
            int low = Math.max(x - halfFoot, supportX + (below == null ? -15 : below.supportLeft()) * SCALE);
            int high = Math.min(x + halfFoot, supportX + (below == null ? 15 : below.supportRight()) * SCALE);

            mass += current.width();
            moment += current.width() * x;
            if (high - low < 2 * SCALE || moment < low * mass || moment > high * mass) {
                return layer + 1;
            }
        }
        return 0;
    }

    public enum Chair {
        WIDE(20, -8, 8), MEDIUM(16, -6, 6), LEFT(16, -8, -2), RIGHT(16, 2, 8),
        SMALL(12, -3, 3), TIGHT_LEFT(14, -7, -3), TIGHT_RIGHT(14, 3, 7), TINY(10, -3, 3);

        private final int width;
        private final int supportLeft;
        private final int supportRight;

        Chair(int width, int supportLeft, int supportRight) {
            this.width = width;
            this.supportLeft = supportLeft;
            this.supportRight = supportRight;
        }

        public int width() {
            return width;
        }

        public int supportLeft() {
            return supportLeft;
        }

        public int supportRight() {
            return supportRight;
        }

        int supportCenter() {
            return (supportLeft + supportRight) / 2;
        }
    }

    public record Motion(int amplitude, int periodMs, int fallMs) {
        public int offsetAt(int elapsedMs) {
            int phase = elapsedMs % periodMs;
            int distance = phase <= periodMs / 4 ? phase
                    : phase < periodMs * 3 / 4 ? periodMs / 2 - phase
                    : phase - periodMs;
            long slope = 4L * distance * 1024 / periodMs;
            long eased = 3 * slope * 1024 * 1024 - slope * slope * slope;
            return (int) (amplitude * eased / (2L * 1024 * 1024 * 1024));
        }
    }

    public record Drop(int position, int stress, Integer failedLayer) {
    }
}

package com.project.jarihana.chairstack.domain;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class ChairStackToyRules {

    public static final int WIDTH = 14;
    public static final int HEIGHT = 24;
    public static final int ORIENTATIONS = 16;
    private static final int NO_SURFACE = -1000;
    private static final int REACH = 48;
    private static final int CONTACT_DEPTH = 2;
    private static final int EDGE_TOLERANCE = 5;
    private static final int[] DIRECTIONS = {0, 1, 4, 2, 3, 5, 6, 1, 0, 7, 2, 3};
    private static final List<Integer> LADDER_ROWS = List.of(
            1792, 1798, 2039, 2047, 1855, 1799, 2023, 2047, 1855, 1799, 2023, 4095,
            7407, 16351, 16383, 16379, 13883, 13883, 13883, 13851, 12315, 12312, 4120, 24);
    private static final List<Toy> TOYS = List.of("red", "yellow", "green", "blue").stream()
            .map(color -> new Toy(color, LADDER_ROWS)).toList();
    private static final List<Profile> PROFILES = java.util.stream.IntStream.range(0, ORIENTATIONS)
            .mapToObj(ChairStackToyRules::profile).toList();

    private ChairStackToyRules() {
    }

    public static Toy toy(int index) {
        return TOYS.get(index % TOYS.size());
    }

    public static int initialOrientation(int index) {
        return DIRECTIONS[index % DIRECTIONS.length];
    }

    public static Result drop(List<Pose> tower, int stress, int aim, int phase, int orientation) {
        int height = tower.size();
        var motion = ChairStackRules.motion(height, stress);
        int offset = motion.offsetAt(phase + motion.fallMs());
        int x = aim - Math.floorDiv(offset + ChairStackRules.SCALE / 2, ChairStackRules.SCALE);
        var board = new Board();
        List<Contact> contacts = new ArrayList<>();
        for (int i = 0; i < height; i++) {
            var pose = tower.get(i);
            var shape = PROFILES.get(pose.orientation());
            contacts.add(board.contact(shape, pose.x()));
            board.add(shape, pose, i);
        }
        var contact = board.contact(PROFILES.get(orientation), x);
        var pose = new Pose(x, contact.base(), orientation);
        contacts.add(contact);
        int failure = height > 0 && contact.parent() < 0
                ? height + 1 : unstableJoint(tower, pose, contacts);
        if (failure != 0) {
            return new Result(pose, stress, failure);
        }

        int error = Math.abs(x * 2 - (contact.left() + contact.right() + 1)) * 50;
        int nextStress = error <= ChairStackRules.SCALE
                ? Math.max(0, stress - (90 - error / 2))
                : Math.min(300, stress + (error - ChairStackRules.SCALE) / 3);
        return new Result(pose, nextStress, null);
    }

    private static int unstableJoint(List<Pose> tower, Pose candidate, List<Contact> contacts) {
        int size = contacts.size();
        int[] mass = new int[size];
        int[] moment = new int[size];
        for (int layer = size - 1; layer >= 0; layer--) {
            int x = layer == size - 1 ? candidate.x() : tower.get(layer).x();
            Contact contact = contacts.get(layer);
            mass[layer]++;
            moment[layer] += x * 2;
            int left = (contact.left() * 2 - EDGE_TOLERANCE) * mass[layer];
            int right = (contact.right() * 2 + 2 + EDGE_TOLERANCE) * mass[layer];
            if (contact.base() == NO_SURFACE || moment[layer] < left || moment[layer] > right) {
                return layer + 1;
            }
            if (contact.parent() >= 0) {
                mass[contact.parent()] += mass[layer];
                moment[contact.parent()] += moment[layer];
            }
        }
        return 0;
    }

    private static Profile profile(int orientation) {
        int turns = orientation & 3;
        int width = turns % 2 == 0 ? WIDTH : HEIGHT;
        int height = turns % 2 == 0 ? HEIGHT : WIDTH;
        int[] bottom = new int[width];
        int[] top = new int[width];
        Arrays.fill(bottom, height);
        for (int row = 0; row < HEIGHT; row++) {
            for (int column = 0; column < WIDTH; column++) {
                if ((LADDER_ROWS.get(row) & (1 << column)) == 0) {
                    continue;
                }
                int x = (orientation & 4) == 0 ? column : WIDTH - 1 - column;
                int y = (orientation & 8) == 0 ? row : HEIGHT - 1 - row;
                int rotatedX = switch (turns) {
                    case 1 -> HEIGHT - 1 - y;
                    case 2 -> WIDTH - 1 - x;
                    case 3 -> y;
                    default -> x;
                };
                int rotatedY = switch (turns) {
                    case 1 -> x;
                    case 2 -> HEIGHT - 1 - y;
                    case 3 -> WIDTH - 1 - x;
                    default -> y;
                };
                int fromBottom = height - 1 - rotatedY;
                bottom[rotatedX] = Math.min(bottom[rotatedX], fromBottom);
                top[rotatedX] = Math.max(top[rotatedX], fromBottom + 1);
            }
        }
        return new Profile(bottom, top);
    }

    private static final class Board {
        private final int[] surface = new int[REACH * 2];
        private final int[] owner = new int[REACH * 2];

        private Board() {
            Arrays.fill(surface, NO_SURFACE);
            Arrays.fill(surface, REACH - 15, REACH + 15, 0);
            Arrays.fill(owner, -1);
        }

        private Contact contact(Profile shape, int x) {
            int start = x - shape.top().length / 2;
            int base = NO_SURFACE;
            for (int i = 0; i < shape.top().length; i++) {
                int y = surface[start + i + REACH];
                if (shape.top()[i] > 0 && y != NO_SURFACE) {
                    base = Math.max(base, y - shape.bottom()[i]);
                }
            }
            int left = x;
            int right = x;
            int parent = -1;
            int closest = Integer.MAX_VALUE;
            boolean touching = false;
            if (base == NO_SURFACE) {
                return new Contact(base, left, right, parent);
            }
            for (int i = 0; i < shape.top().length; i++) {
                int column = start + i;
                int y = surface[column + REACH];
                int gap = base - y + shape.bottom()[i];
                if (shape.top()[i] == 0 || y == NO_SURFACE || gap > CONTACT_DEPTH) {
                    continue;
                }
                left = touching ? left : column;
                right = column;
                touching = true;
                int distance = Math.abs(column * 2 + 1 - x * 2);
                int support = owner[column + REACH];
                if (gap == 0 && support >= 0 && distance < closest) {
                    closest = distance;
                    parent = support;
                }
            }
            return new Contact(base, left, right, parent);
        }

        private void add(Profile shape, Pose pose, int index) {
            int start = pose.x() - shape.top().length / 2 + REACH;
            for (int i = 0; i < shape.top().length; i++) {
                int y = pose.y() + shape.top()[i];
                if (shape.top()[i] > 0 && y > surface[start + i]) {
                    surface[start + i] = y;
                    owner[start + i] = index;
                }
            }
        }
    }

    private record Contact(int base, int left, int right, int parent) {
    }

    private record Profile(int[] bottom, int[] top) {
    }

    public record Toy(String color, List<Integer> rows) {
    }

    public record Pose(int x, int y, int orientation) {
    }

    public record Result(Pose pose, int stress, Integer failedLayer) {
    }
}

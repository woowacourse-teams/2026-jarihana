package com.project.jarihana.chairstack.domain;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.UUID;
import org.dyn4j.dynamics.Body;
import org.dyn4j.geometry.Geometry;
import org.dyn4j.geometry.MassType;
import org.dyn4j.world.World;

public final class ChairStackPhysics {

    public static final double PLATFORM_HALF_WIDTH = 1.65;
    private static final double GRID = 0.1;
    private static final int STEPS_PER_SECOND = 60;
    private static final int FRAME_STEPS = 4;
    private static final int MAX_STEPS = 216;
    private static final int FALL_TAIL_STEPS = 34;
    private static final double LOSS_Y = -0.9;
    private static final int OPENING_CHAIRS = 4;
    private static final int FULL_DIRECTION_VARIETY_AT = 8;
    private static final int FULL_IMPACT_AT = 10;
    // Level the front feet in the same local coordinate system as the artwork.
    private static final double LEVEL_CHAIR_SHEAR = 0.18;
    private static final double LEVEL_BASE_WIDTH = 1.25;
    private static final double LEVEL_SIDEWAYS_WIDTH = 0.82;
    private static final double EARLY_UPRIGHT_WIDTH = 0.82;
    private static final double EARLY_UPRIGHT_HEIGHT = 0.80;
    private static final double EARLY_SIDEWAYS_WIDTH = 0.73;
    private static final double EARLY_SIDEWAYS_HEIGHT = 1.20;
    private static final String[] COLORS = {"red", "yellow", "green", "blue"};
    private static final int[] DIRECTIONS = {0, 1, 2, 3, 4, 5, 7};

    // Front-view silhouette in the same 14 by 24 coordinates as the Canvas drawing.
    private static final FlatRail[] FLAT_RAILS = {
        new FlatRail(0, 0, 2.1, 24),
        new FlatRail(11.9, 0, 2.1, 24),
        new FlatRail(2.1, 1.65, 9.8, 1.8),
        new FlatRail(2.1, 6.9, 9.8, 1.8),
        new FlatRail(2.1, 12.1, 9.8, 2.25)
    };

    // Continuous back and rear leg, seat, and front leg in the Canvas coordinate system.
    private static final FlatRail[] SIDE_PROFILE_RAILS = {
        new FlatRail(0, 0, 2.5, 24),
        new FlatRail(2.5, 9.2, 11.5, 3.2),
        new FlatRail(11.4, 12.4, 2.6, 11.6)
    };

    // Openings in the projected backrest and seat let other legs enter between the rails.
    private static final FlatRail[] INTERLOCKING_RAILS = {
        new FlatRail(0, 0, 2.5, 24),
        new FlatRail(11.4, 12.4, 2.6, 11.6),
        new FlatRail(2.5, 1, 1.05, 0.55),
        new FlatRail(2.5, 4.6, 1.05, 0.55),
        new FlatRail(2.5, 8.1, 1.05, 0.55),
        new FlatRail(2.5, 9.2, 1.2, 3.2),
        new FlatRail(7.2, 9.2, 1.15, 3.2),
        new FlatRail(11.85, 9.2, 2.15, 3.2)
    };

    // Rails, open seat frame and legs in the 14 by 24 sprite coordinate system.
    private static final Rail[] RAILS = {
        new Rail(1.35, 2.3, 1.35, 13.7, 2.2, 0.85),
        new Rail(9.65, 0.8, 9.65, 12.1, 2.45, 0.85),
        new Rail(1.9, 3.65, 9.1, 2.65, 1.5, 0.72),
        new Rail(1.9, 7.65, 9.1, 6.65, 1.45, 0.72),
        new Rail(1.8, 11.55, 9.55, 10.6, 1.55, 0.9),
        new Rail(0.9, 12.55, 3.8, 15.1, 1.8, 1.08),
        new Rail(9.9, 11.85, 13.0, 14.5, 1.85, 1.08),
        new Rail(3.25, 15.1, 13.0, 14.4, 1.9, 1.3),
        new Rail(5.25, 11.95, 7.55, 14.5, 1.15, 0.84),
        new Rail(1.05, 13.45, 0.92, 20.55, 1.55, 0.88),
        new Rail(4.0, 15.45, 3.9, 23.85, 1.62, 1.0),
        new Rail(9.55, 13.9, 9.4, 19.65, 1.52, 0.88),
        new Rail(12.83, 14.6, 12.66, 22.3, 1.62, 1.0)
    };

    private ChairStackPhysics() {
    }

    public static Piece piece(UUID run, int turn, PhysicsProfile profile) {
        var random = new SplittableRandom(run.getMostSignificantBits() ^ Long.rotateLeft(run.getLeastSignificantBits(), 23)
                ^ ((turn + 1L) * 0x9E3779B97F4A7C15L));
        String color = COLORS[random.nextInt(COLORS.length)];
        if (profile.usesMixedOpening() && turn < OPENING_CHAIRS) {
            return openingPiece(run, turn, color, profile);
        }
        int direction = direction(run, turn, profile, random);
        double[] size = profile.sizes[random.nextInt(profile.sizes.length)];
        double tilt = profile.usesDifficultyCurve()
                ? random.nextDouble(-1, 1) * (0.025 + 0.115 * difficulty(turn, profile))
                : random.nextDouble(-0.14, 0.14);
        int quarterTurns = direction & 3;
        boolean sideProfile = profile.usesSideProfile();
        boolean flat = sideProfile || profile == PhysicsProfile.FLAT_CHAIRS;
        boolean upright = profile.levelsUprightChairs() && quarterTurns == 0;
        double shear = upright && !flat ? LEVEL_CHAIR_SHEAR : 0;
        double angle = -quarterTurns * Math.PI / 2 + (upright ? 0 : tilt);
        if (profile.usesDifficultyCurve()) angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        return new Piece(color, (direction & 4) != 0, rounded(angle), size[0], size[1], shear, flat, sideProfile);
    }

    private static Piece openingPiece(UUID run, int turn, String color, PhysicsProfile profile) {
        boolean mirror = (run.getLeastSignificantBits() & 1) != 0;
        int uprightTurn = 2 + (int) ((run.getLeastSignificantBits() >>> 1) & 1);
        double angle = turn == 0 ? 0 : (mirror ? 1 : -1) * Math.PI / 2;
        if (profile == PhysicsProfile.INTERLOCKING) {
            // At the full chair size, the second chair can rest upside down across the back and seat.
            double openingAngle = turn == uprightTurn ? 0 : turn == 1 ? Math.PI : angle;
            double[] size = profile.sizes[0];
            return new Piece(color, mirror, rounded(openingAngle), size[0], size[1], 0, true, true);
        }
        // Older profiles use a wider upright base to support the narrower chairs that follow.
        double[] size = profile.sizes[turn == 0 ? 2 : 1];
        boolean sideProfile = profile == PhysicsProfile.SIDE_PROFILE;
        boolean flat = sideProfile || profile == PhysicsProfile.FLAT_CHAIRS;
        if (profile.usesVariedOpening() && turn > 0) {
            if (turn == uprightTurn) {
                double width = sideProfile ? 0.72 : EARLY_UPRIGHT_WIDTH;
                return new Piece(color, mirror, 0, width, EARLY_UPRIGHT_HEIGHT,
                        flat ? 0 : LEVEL_CHAIR_SHEAR, flat, sideProfile);
            }
            // The first sideways chair rests on its long back rail.
            double sidewaysAngle = sideProfile && turn == 1 ? -angle : angle;
            return new Piece(color, mirror, rounded(sidewaysAngle), EARLY_SIDEWAYS_WIDTH, EARLY_SIDEWAYS_HEIGHT,
                    0, flat, sideProfile);
        }
        if (profile.levelsUprightChairs()) {
            double width = turn == 0 ? LEVEL_BASE_WIDTH : LEVEL_SIDEWAYS_WIDTH;
            double shear = turn == 0 && !flat ? LEVEL_CHAIR_SHEAR : 0;
            return new Piece(color, mirror, rounded(angle), width, size[1], shear, flat, sideProfile);
        }
        return new Piece(color, mirror, rounded(angle), size[0], size[1], 0, false, false);
    }

    private static int direction(UUID run, int turn, PhysicsProfile profile, SplittableRandom random) {
        if (profile.usesDifficultyCurve()) {
            if (turn < OPENING_CHAIRS || (turn < FULL_DIRECTION_VARIETY_AT
                    && random.nextInt(FULL_DIRECTION_VARIETY_AT + 1 - turn) != 0)) {
                return (run.getLeastSignificantBits() & 1) == 0 ? 1 : 7;
            }
        } else if (turn == 0) {
            return random.nextInt(2) * 4;
        }
        return DIRECTIONS[random.nextInt(DIRECTIONS.length)];
    }

    private static double difficulty(int turn, PhysicsProfile profile) {
        if (!profile.usesDifficultyCurve()) return 1;
        int firstIncrease = OPENING_CHAIRS - 1;
        return Math.clamp((double) (turn - firstIncrease) / (FULL_IMPACT_AT - firstIncrease), 0, 1);
    }

    public static double launchY(UUID run, List<Pose> tower, PhysicsProfile profile) {
        return launchY(run, tower, profile, piece(run, tower.size(), profile).angle());
    }

    private static double launchY(UUID run, List<Pose> tower, PhysicsProfile profile, double angle) {
        double top = 0;
        for (int i = 0; i < tower.size(); i++) {
            var pose = tower.get(i);
            top = Math.max(top, pose.y() + halfHeight(piece(run, i, profile), pose.angle()));
        }
        var next = piece(run, tower.size(), profile);
        double openingClearance = profile.openingClearance();
        double clearance = openingClearance + (0.8 - openingClearance) * difficulty(tower.size(), profile);
        return rounded(top + halfHeight(next, angle) + clearance);
    }

    public static Result drop(UUID run, List<Pose> tower, int aim, PhysicsProfile profile) {
        return drop(run, tower, aim, profile, null);
    }

    public static Result drop(UUID run, List<Pose> tower, int aim, PhysicsProfile profile, Adjustment adjustment) {
        var world = new World<Body>();
        world.setGravity(0, -14.0);
        var settings = world.getSettings();
        settings.setVelocityConstraintSolverIterations(12);
        settings.setPositionConstraintSolverIterations(8);
        settings.setMaximumAtRestLinearVelocity(0.12);
        settings.setMaximumAtRestAngularVelocity(0.12);

        var floor = new Body();
        floor.addFixture(Geometry.createRectangle(PLATFORM_HALF_WIDTH * 2, 0.4), 1.0, 0.86, 0.0);
        floor.translate(0, -0.2);
        floor.setMass(MassType.INFINITE);
        world.addBody(floor);

        double difficulty = difficulty(tower.size(), profile);
        var chairs = new ArrayList<Body>(tower.size() + 1);
        for (int i = 0; i < tower.size(); i++) {
            var body = chair(piece(run, i, profile), tower.get(i), difficulty, profile);
            world.addBody(body);
            body.setAtRest(true);
            chairs.add(body);
        }
        var next = piece(run, tower.size(), profile);
        double angle = adjustment == null ? next.angle() : Math.toRadians(-adjustment.angleDegrees());
        Boolean mirror = adjustment == null ? null : adjustment.mirrored();
        var spawn = new Pose(aim * GRID, launchY(run, tower, profile, angle), angle, mirror);
        var falling = chair(next, spawn, difficulty, profile);
        falling.setBullet(true);
        world.addBody(falling);
        chairs.add(falling);

        List<Frame> frames = new ArrayList<>();
        frames.add(frame(chairs, 0));
        int firstLoss = 0;
        int lostAt = 0;
        int step = 0;
        for (int tick = 1; tick <= MAX_STEPS; tick++) {
            world.step(1);
            step = tick;
            if (step % FRAME_STEPS == 0) {
                frames.add(frame(chairs, step));
            }
            if (firstLoss == 0) {
                firstLoss = fallenChair(chairs);
                if (firstLoss != 0) lostAt = step;
            }
            if ((firstLoss != 0 && step - lostAt >= FALL_TAIL_STEPS)
                    || (firstLoss == 0 && chairs.stream().allMatch(Body::isAtRest))) {
                break;
            }
        }

        var last = frame(chairs, step);
        if (frames.getLast().atMs() != last.atMs()) frames.add(last);
        int failure = firstLoss == 0 ? failedSupport(world, floor, chairs, tower, last.poses()) : firstLoss;
        return new Result(last.poses(), List.copyOf(frames), failure == 0 ? null : failure);
    }

    private static Body chair(Piece piece, Pose pose, double difficulty, PhysicsProfile profile) {
        var body = new Body();
        body.setUserData(pose.mirror());
        double xScale = (piece.withMirror(pose.mirror()).mirror() ? -1 : 1) * piece.widthScale() * GRID;
        double yScale = piece.heightScale() * GRID;
        double openingFriction = profile.usesMixedOpening() ? 1.45 : 0.97;
        double openingAngularDamping = profile.openingAngularDamping();
        double friction = openingFriction - (openingFriction - 0.72) * difficulty;
        double restitution = 0.025 + 0.015 * difficulty;
        if (piece.flat()) {
            var rails = switch (profile) {
                case INTERLOCKING -> INTERLOCKING_RAILS;
                case SIDE_PROFILE -> SIDE_PROFILE_RAILS;
                default -> FLAT_RAILS;
            };
            addFlatFixtures(body, rails, xScale, yScale, friction, restitution);
        } else {
            addPerspectiveFixtures(body, piece, xScale, yScale, friction, restitution);
        }
        body.setMass(MassType.NORMAL);
        body.setLinearDamping(0.24 - 0.09 * difficulty);
        body.setAngularDamping(openingAngularDamping - (openingAngularDamping - 0.65) * difficulty);
        body.rotate(pose.angle(), 0, 0);
        body.translate(pose.x(), pose.y());
        return body;
    }

    private static void addFlatFixtures(Body body, FlatRail[] rails, double xScale, double yScale,
                                        double friction, double restitution) {
        for (var rail : rails) {
            var shape = Geometry.createRectangle(rail.width() * Math.abs(xScale), rail.height() * yScale);
            shape.translate((rail.x() + rail.width() / 2 - 7) * xScale,
                    (12 - rail.y() - rail.height() / 2) * yScale);
            body.addFixture(shape, 1, friction, restitution);
        }
    }

    private static void addPerspectiveFixtures(Body body, Piece piece, double xScale, double yScale,
                                               double friction, double restitution) {
        for (var rail : RAILS) {
            double dx = (rail.endX() - rail.startX()) * xScale;
            double startY = rail.startY() + piece.verticalShear() * (rail.startX() - 7);
            double endY = rail.endY() + piece.verticalShear() * (rail.endX() - 7);
            double dy = (startY - endY) * yScale;
            var shape = Geometry.createRectangle(Math.hypot(dx, dy), rail.thickness() * GRID
                    * (piece.widthScale() + piece.heightScale()) / 2);
            shape.rotate(Math.atan2(dy, dx));
            shape.translate(((rail.startX() + rail.endX()) / 2 - 7) * xScale,
                    (12 - (startY + endY) / 2) * yScale);
            body.addFixture(shape, rail.density(), friction, restitution);
        }
    }

    private static int failedSupport(World<Body> world, Body floor, List<Body> chairs,
                                     List<Pose> before, List<Pose> after) {
        Set<Body> grounded = new HashSet<>();
        var frontier = new ArrayDeque<Body>();
        frontier.add(floor);
        grounded.add(floor);
        while (!frontier.isEmpty()) {
            for (var other : world.getInContactBodies(frontier.remove(), false)) {
                if (grounded.add(other)) frontier.add(other);
            }
        }
        for (int i = 0; i < chairs.size(); i++) {
            if (!grounded.contains(chairs.get(i))) return i + 1;
            if (i < before.size() && before.get(i).y() - after.get(i).y() > 1.15) return i + 1;
        }
        if (!before.isEmpty() && world.getInContactBodies(chairs.getLast(), false).stream().allMatch(floor::equals)) {
            return chairs.size();
        }
        return 0;
    }

    private static int fallenChair(List<Body> chairs) {
        for (int i = 0; i < chairs.size(); i++) {
            if (chairs.get(i).getWorldCenter().y < LOSS_Y) return i + 1;
        }
        return 0;
    }

    private static Frame frame(List<Body> chairs, int step) {
        var poses = chairs.stream().map(body -> {
            var transform = body.getTransform();
            return new Pose(rounded(transform.getTranslationX()), rounded(transform.getTranslationY()),
                    rounded(transform.getRotationAngle()), (Boolean) body.getUserData());
        }).toList();
        return new Frame(Math.round(step * 1000f / STEPS_PER_SECOND), poses);
    }

    private static double halfHeight(Piece piece, double angle) {
        return Math.abs(Math.cos(angle)) * 12 * GRID * piece.heightScale()
                + Math.abs(Math.sin(angle)) * 7 * GRID * piece.widthScale();
    }

    private static double rounded(double value) {
        return Math.round(value * 10000) / 10000.0;
    }

    public enum PhysicsProfile {
        ORIGINAL(1, new double[][] {{1, 1}, {0.86, 1.03}, {1.13, 0.9}}),
        TALL(2, new double[][] {{1, 1.12}, {0.86, 1.1}, {1.03, 1.14}}),
        PROGRESSIVE(3, TALL.sizes),
        MIXED_OPENING(4, TALL.sizes),
        LEVEL_UPRIGHT(5, TALL.sizes),
        VARIED_OPENING(6, TALL.sizes),
        FLAT_CHAIRS(7, TALL.sizes),
        SIDE_PROFILE(8, TALL.sizes),
        INTERLOCKING(9, new double[][] {{LEVEL_BASE_WIDTH, TALL.sizes[2][1]}});

        private final int version;
        private final double[][] sizes;

        PhysicsProfile(int version, double[][] sizes) {
            this.version = version;
            this.sizes = sizes;
        }

        private boolean usesDifficultyCurve() {
            return this == PROGRESSIVE || usesMixedOpening();
        }

        private boolean usesMixedOpening() {
            return this == MIXED_OPENING || levelsUprightChairs();
        }

        private boolean levelsUprightChairs() {
            return this == LEVEL_UPRIGHT || usesVariedOpening();
        }

        private boolean usesVariedOpening() {
            return this == VARIED_OPENING || this == FLAT_CHAIRS || usesSideProfile();
        }

        private boolean usesSideProfile() {
            return this == SIDE_PROFILE || this == INTERLOCKING;
        }

        private double openingClearance() {
            return switch (this) {
                case VARIED_OPENING, FLAT_CHAIRS, SIDE_PROFILE, INTERLOCKING -> 0.14;
                case LEVEL_UPRIGHT -> 0.18;
                case MIXED_OPENING -> 0.22;
                default -> 0.32;
            };
        }

        private double openingAngularDamping() {
            return switch (this) {
                case VARIED_OPENING, FLAT_CHAIRS, SIDE_PROFILE, INTERLOCKING -> 8.0;
                case LEVEL_UPRIGHT -> 4.8;
                case MIXED_OPENING -> 3.1;
                default -> 1.9;
            };
        }

        public int version() {
            return version;
        }

        public static PhysicsProfile fromVersion(int version) {
            return switch (version) {
                case 1 -> ORIGINAL;
                case 2 -> TALL;
                case 3 -> PROGRESSIVE;
                case 4 -> MIXED_OPENING;
                case 5 -> LEVEL_UPRIGHT;
                case 6 -> VARIED_OPENING;
                case 7 -> FLAT_CHAIRS;
                case 8 -> SIDE_PROFILE;
                case 9 -> INTERLOCKING;
                default -> throw new IllegalArgumentException("Unknown chair physics profile: " + version);
            };
        }
    }

    private record Rail(double startX, double startY, double endX, double endY, double thickness, double density) {
    }

    private record FlatRail(double x, double y, double width, double height) {
    }

    public record Piece(String color, boolean mirror, double angle, double widthScale, double heightScale,
                        double verticalShear, boolean flat, boolean sideProfile) {
        public Piece withMirror(Boolean value) {
            return value == null || value == mirror ? this
                    : new Piece(color, value, angle, widthScale, heightScale, verticalShear, flat, sideProfile);
        }
    }

    public record Adjustment(int angleDegrees, boolean mirrored) {
    }

    public record Pose(double x, double y, double angle, Boolean mirror) {
    }

    public record Frame(int atMs, List<Pose> poses) {
    }

    public record Result(List<Pose> poses, List<Frame> frames, Integer failedLayer) {
    }
}

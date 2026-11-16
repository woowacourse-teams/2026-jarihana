package com.project.jarihana.chairstack.domain;

import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.FLAT_CHAIRS;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.INTERLOCKING;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.LEVEL_UPRIGHT;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.MIXED_OPENING;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.ORIGINAL;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.SIDE_PROFILE;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.TALL;
import static com.project.jarihana.chairstack.domain.ChairStackPhysics.PhysicsProfile.VARIED_OPENING;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class ChairStackPhysicsTest {

    private static final UUID SEED = new UUID(761903L, 113);

    @Test
    void eachRunHasAStableButVariedQueue() {
        var pieces = IntStream.range(0, 12).mapToObj(turn -> ChairStackPhysics.piece(SEED, turn, TALL)).toList();
        assertThat(pieces).isEqualTo(IntStream.range(0, 12).mapToObj(turn -> ChairStackPhysics.piece(SEED, turn, TALL)).toList());
        assertThat(pieces).isNotEqualTo(IntStream.range(0, 12)
                .mapToObj(turn -> ChairStackPhysics.piece(new UUID(761903L, 2099), turn, TALL)).toList());
        assertThat(pieces.stream().map(ChairStackPhysics.Piece::color).distinct()).hasSizeGreaterThan(1);
        assertThat(pieces.stream().map(ChairStackPhysics.Piece::widthScale).distinct()).hasSizeGreaterThan(1);
    }

    @Test
    void tallerChairsKeepTheOriginalQueueWithLessCompressedProportions() {
        for (int turn = 0; turn < 12; turn++) {
            var original = ChairStackPhysics.piece(SEED, turn, ORIGINAL);
            var taller = ChairStackPhysics.piece(SEED, turn, TALL);
            assertThat(taller.color()).isEqualTo(original.color());
            assertThat(taller.angle()).isEqualTo(original.angle());
            assertThat(taller.heightScale() / taller.widthScale())
                    .isGreaterThan(original.heightScale() / original.widthScale());
        }
    }

    @Test
    void earlyQueueVariesTheTurnOfTheSecondUprightChair() {
        for (long bits = 0; bits < 4; bits++) {
            var seed = new UUID(761903L, bits);
            var uprightTurns = IntStream.range(0, 4)
                    .filter(turn -> ChairStackPhysics.piece(seed, turn, SIDE_PROFILE).angle() == 0)
                    .boxed().toList();

            assertThat(uprightTurns).containsExactly(0, bits < 2 ? 2 : 3);
            assertThat(Math.abs(ChairStackPhysics.piece(seed, uprightTurns.getLast(), LEVEL_UPRIGHT).angle()))
                    .isGreaterThan(1.5);
        }
    }

    @Test
    void firstFourChairsCanBeStackedWithSmallPositioningErrors() {
        for (int sample = 0; sample < 12; sample++) {
            var seed = new UUID(761903L, 113 + sample * 1987L);
            assertThat(ChairStackPhysics.piece(seed, 0, SIDE_PROFILE).angle()).isZero();
            assertThat(Math.abs(ChairStackPhysics.piece(seed, 1, SIDE_PROFILE).angle())).isGreaterThan(1.5);
            List<ChairStackPhysics.Pose> tower = List.of();
            for (int turn = 0; turn < 4; turn++) {
                int aim = (sample + turn) % 3 - 1;
                var drop = ChairStackPhysics.drop(seed, tower, aim, SIDE_PROFILE);
                assertThat(drop.failedLayer()).as("sample %d, chair %d", sample, turn + 1).isNull();
                tower = drop.poses();
            }
        }
    }

    @Test
    void uprightOpeningChairStaysLevelWhenItLands() {
        for (long mirror : List.of(0L, 1L)) {
            var seed = new UUID(761903L, mirror);
            var piece = ChairStackPhysics.piece(seed, 0, SIDE_PROFILE);
            var drop = ChairStackPhysics.drop(seed, List.of(), 0, SIDE_PROFILE);

            assertThat(drop.failedLayer()).isNull();
            assertThat(drop.frames().getFirst().poses().getFirst().angle()).isZero();
            assertThat(drop.poses().getFirst().angle()).isCloseTo(0.0, within(0.015));
            assertThat(drop.poses().getFirst().y()).isCloseTo(1.2 * piece.heightScale(), within(0.02));
            assertThat(ChairStackPhysics.piece(seed, 0, FLAT_CHAIRS).sideProfile()).isFalse();
            assertThat(ChairStackPhysics.piece(seed, 0, VARIED_OPENING).flat()).isFalse();
            assertThat(ChairStackPhysics.piece(seed, 0, MIXED_OPENING).verticalShear()).isZero();
        }
    }

    @Test
    void interlockingChairsMatchTheSizeOfTheFirstChair() {
        var first = ChairStackPhysics.piece(SEED, 0, SIDE_PROFILE);
        for (int turn = 0; turn < 100; turn++) {
            var next = ChairStackPhysics.piece(SEED, turn, INTERLOCKING);
            assertThat(next.widthScale()).isEqualTo(first.widthScale());
            assertThat(next.heightScale()).isEqualTo(first.heightScale());
            assertThat(next.sideProfile()).isTrue();
        }
    }

    @Test
    void aFullSizeLegCanEnterTheSeatSlot() {
        var seed = new UUID(761903L, 0);
        var base = ChairStackPhysics.drop(seed, List.of(), 0, INTERLOCKING);
        var fitted = ChairStackPhysics.drop(seed, base.poses(), -4, INTERLOCKING,
                new ChairStackPhysics.Adjustment(0, false));

        assertThat(fitted.failedLayer()).isNull();
        var tip = legTipInSupportCoordinates(seed, fitted.poses());
        assertThat(tip[0]).isBetween(8.35, 11.85);
        assertThat(tip[1]).isBetween(10.0, 12.4);
    }

    @Test
    void aFullSizeLegCanEnterTheSidewaysBackrestSlot() {
        var seed = new UUID(761903L, 0);
        var base = ChairStackPhysics.drop(seed, List.of(), 0, INTERLOCKING,
                new ChairStackPhysics.Adjustment(-90, false));
        var fitted = ChairStackPhysics.drop(seed, base.poses(), -1, INTERLOCKING,
                new ChairStackPhysics.Adjustment(90, false));

        assertThat(fitted.failedLayer()).isNull();
        var tip = legTipInSupportCoordinates(seed, fitted.poses());
        assertThat(tip[0]).isBetween(2.5, 3.55);
        assertThat(tip[1]).isBetween(5.15, 8.1);
    }

    private double[] legTipInSupportCoordinates(UUID seed, List<ChairStackPhysics.Pose> poses) {
        var chair = ChairStackPhysics.piece(seed, 0, INTERLOCKING);
        var support = poses.getFirst();
        var inserted = poses.getLast();
        double legX = (12.7 - 7) * chair.widthScale() * 0.1;
        double legY = (12 - 23.5) * chair.heightScale() * 0.1;
        double dx = inserted.x() - support.x() + Math.cos(inserted.angle()) * legX - Math.sin(inserted.angle()) * legY;
        double dy = inserted.y() - support.y() + Math.sin(inserted.angle()) * legX + Math.cos(inserted.angle()) * legY;
        return new double[] {
            7 + (Math.cos(support.angle()) * dx + Math.sin(support.angle()) * dy) / (chair.widthScale() * 0.1),
            12 - (-Math.sin(support.angle()) * dx + Math.cos(support.angle()) * dy) / (chair.heightScale() * 0.1)
        };
    }

    @Test
    void gravityAndContactChangeThePoseAndAnEdgeDropEndsTheRun() {
        var first = ChairStackPhysics.drop(SEED, List.of(), 0, TALL);
        assertThat(first.failedLayer()).isNull();
        var start = first.frames().getFirst().poses().getFirst();
        var rest = first.poses().getFirst();
        assertThat(rest.y()).isLessThan(start.y());
        assertThat(rest.angle()).isNotEqualTo(start.angle());

        var edge = ChairStackPhysics.drop(SEED, first.poses(), 18, TALL);
        assertThat(edge.failedLayer()).isNotNull();
        assertThat(edge.frames()).isEqualTo(ChairStackPhysics.drop(SEED, first.poses(), 18, TALL).frames());
    }
}

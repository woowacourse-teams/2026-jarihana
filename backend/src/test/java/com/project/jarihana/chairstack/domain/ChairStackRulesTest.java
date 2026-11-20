package com.project.jarihana.chairstack.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class ChairStackRulesTest {

    @Test
    void centeredPlacementsFailAtTheFirstOffsetSupport() {
        var result = ChairStackRules.drop(Collections.nCopies(7, 0), 0, 0, 0);
        assertThat(result.failedLayer()).isEqualTo(8);
    }

    @Test
    void anUpperChairCanLandWhileALowerJointFails() {
        var result = ChairStackRules.drop(List.of(0, 0, 0, 0, 0, 0, 400, 0, 0), 0, 6, 0);
        assertThat(result.failedLayer()).isEqualTo(8);
    }

    @Test
    void heightAddsSwayAndCenteringReducesAccumulatedSway() {
        assertThat(ChairStackRules.motion(4, 200).amplitude()).isZero();
        assertThat(ChairStackRules.motion(30, 0).amplitude())
                .isGreaterThan(ChairStackRules.motion(15, 0).amplitude());
        var placements = Collections.nCopies(5, 0);
        var centered = ChairStackRules.drop(placements, 90, 0, 0);
        var edge = ChairStackRules.drop(placements, 90, 5, 0);
        assertThat(centered.stress()).isLessThan(90);
        assertThat(edge.stress()).isGreaterThan(90);
    }

    @Test
    void landingUsesThePhaseAtContactAndCanChangeTheOutcome() {
        var positions = List.of(0, 0, 0, 0, 0);
        var motion = ChairStackRules.motion(5, 300);
        var away = ChairStackRules.drop(positions, 300, 8, motion.periodMs() * 3 / 4 - motion.fallMs());
        var towards = ChairStackRules.drop(positions, 300, 8, motion.periodMs() / 4 - motion.fallMs());
        assertThat(away.failedLayer()).isNotNull();
        assertThat(towards.failedLayer()).isNull();
    }

    @Test
    void allOneHundredChairsCanBePlaced() {
        var positions = new ArrayList<Integer>();
        int stress = 0;
        for (int index = 0; index < ChairStackRules.MAX_CHAIRS; index++) {
            int x = switch (ChairStackRules.chair(index)) {
                case LEFT -> 4;
                case RIGHT -> -4;
                case TIGHT_LEFT -> 5;
                case TIGHT_RIGHT -> -5;
                default -> 0;
            };
            var motion = ChairStackRules.motion(index, stress);
            var result = ChairStackRules.drop(positions, stress, x, motion.periodMs() - motion.fallMs());
            assertThat(result.failedLayer()).as("chair %d", index + 1).isNull();
            positions.add(result.position());
            stress = result.stress();
        }
        assertThat(positions).hasSize(100);
    }
}

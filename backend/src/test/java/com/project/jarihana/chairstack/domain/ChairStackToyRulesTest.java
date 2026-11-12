package com.project.jarihana.chairstack.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class ChairStackToyRulesTest {

    @Test
    void rotatingOrFlippingChangesWhereTheNextChairTouches() {
        var upright = ChairStackToyRules.drop(List.of(), 0, 0, 0, 0).pose();
        var turned = ChairStackToyRules.drop(List.of(), 0, 0, 0, 1).pose();
        var flipped = ChairStackToyRules.drop(List.of(), 0, 0, 0, 8).pose();
        var afterUpright = ChairStackToyRules.drop(List.of(upright), 0, 0, 0, 0);
        var afterTurned = ChairStackToyRules.drop(List.of(turned), 0, 0, 0, 0);
        var afterFlipped = ChairStackToyRules.drop(List.of(flipped), 0, 0, 0, 0);

        assertThat(afterTurned.pose().y()).isLessThan(afterUpright.pose().y());
        assertThat(afterFlipped.pose().y()).isNotEqualTo(afterUpright.pose().y());
    }

    @Test
    void variedColorsAndDirectionsStillAllowAFullRun() {
        var tower = new ArrayList<ChairStackToyRules.Pose>();
        int stress = 0;
        for (int turn = 0; turn < ChairStackRules.MAX_CHAIRS; turn++) {
            var motion = ChairStackRules.motion(turn, stress);
            var result = ChairStackToyRules.drop(tower, stress, 0, motion.periodMs() - motion.fallMs(),
                    ChairStackToyRules.initialOrientation(turn));
            assertThat(result.failedLayer()).as("drop %d", turn + 1).isNull();
            tower.add(result.pose());
            stress = result.stress();
        }
        assertThat(tower).hasSize(100);
    }
}

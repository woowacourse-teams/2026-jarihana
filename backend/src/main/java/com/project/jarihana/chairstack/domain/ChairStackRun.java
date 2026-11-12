package com.project.jarihana.chairstack.domain;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public record ChairStackRun(UUID id, List<Integer> positions, int stress, Integer failedLayer,
                            OffsetDateTime updatedAt, List<ChairStackToyRules.Pose> toyPoses,
                            List<ChairStackPhysics.Pose> physicsPoses,
                            ChairStackPhysics.PhysicsProfile physicsProfile) {

    public boolean finished() {
        return failedLayer != null || positions.size() == ChairStackRules.MAX_CHAIRS;
    }

    public boolean expired(OffsetDateTime now) {
        return !updatedAt.plusHours(24).isAfter(now);
    }

    public ChairStackRun place(ChairStackRules.Drop drop, OffsetDateTime now) {
        var next = positions;
        if (drop.failedLayer() == null) {
            var appended = new ArrayList<>(positions);
            appended.add(drop.position());
            next = List.copyOf(appended);
        }
        return new ChairStackRun(id, next, drop.stress(), drop.failedLayer(), now, null, null, physicsProfile);
    }

    public boolean toyMode() {
        return toyPoses != null;
    }

    public ChairStackRun placeToy(ChairStackToyRules.Result result, OffsetDateTime now) {
        if (result.failedLayer() != null) {
            return new ChairStackRun(id, positions, result.stress(), result.failedLayer(), now, toyPoses, null, physicsProfile);
        }
        var nextPositions = new ArrayList<>(positions);
        nextPositions.add(result.pose().x() * ChairStackRules.SCALE);
        var nextPoses = new ArrayList<>(toyPoses);
        nextPoses.add(result.pose());
        return new ChairStackRun(id, List.copyOf(nextPositions), result.stress(), null, now, List.copyOf(nextPoses), null, physicsProfile);
    }

    public boolean physicsMode() {
        return physicsPoses != null;
    }

    public ChairStackRun placePhysics(ChairStackPhysics.Result result, OffsetDateTime now) {
        List<Integer> scored = positions;
        if (result.failedLayer() == null) {
            scored = result.poses().stream().map(pose -> (int) Math.round(pose.x() * 1000)).toList();
        }
        return new ChairStackRun(id, scored, 0, result.failedLayer(), now, null, result.poses(), physicsProfile);
    }
}

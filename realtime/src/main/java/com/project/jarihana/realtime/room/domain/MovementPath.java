package com.project.jarihana.realtime.room.domain;

import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.transport.protocol.Values;
import java.util.List;
import java.util.Map;

/** Validates the same bounded X-then-Z microsteps used by the client walker. */
final class MovementPath {
    private MovementPath() {}

    static double distance(RoomLayout layout, Vec3 from, Vec3 to, boolean jumping, Map<String, Object> payload) {
        if (!payload.containsKey("path")) {
            if (!layout.pathAllowed(from, to, jumping)) reject("BLOCKED_PATH");
            return horizontal(from, to);
        }
        if (!(payload.get("path") instanceof List<?> path) || path.isEmpty() || path.size() > 64) {
            throw new RuleViolation("INVALID_MOVEMENT", "PATH_LIMIT");
        }
        Vec3 previous = Values.point(Values.object(path.getFirst()));
        if (horizontal(previous, from) > 0.000001 || Math.abs(previous.y() - layout.floorAt(from)) > 0.000001) reject("PATH_START");
        double distance = 0;
        for (int i = 1; i < path.size(); i++) {
            Vec3 next = Values.point(Values.object(path.get(i)));
            double step = horizontal(previous, next);
            if (step > 0.150001) reject("STEP_LIMIT");
            Vec3 axis = new Vec3(next.x(), previous.y(), previous.z());
            axis = new Vec3(axis.x(), layout.floorAt(axis), axis.z());
            if (!layout.pathAllowed(previous, axis, false) || !layout.pathAllowed(axis, next, false)) reject("BLOCKED_PATH");
            distance += step;
            previous = next;
        }
        if (horizontal(previous, to) > 0.000001 || !layout.valid(previous, false) ||
                !layout.valid(to, jumping) || Math.abs(previous.y() - layout.floorAt(to)) > 0.000001) reject("PATH_END");
        return distance;
    }

    private static double horizontal(Vec3 from, Vec3 to) { return Math.hypot(to.x() - from.x(), to.z() - from.z()); }
    private static void reject(String reason) { throw new RuleViolation("INVALID_MOVEMENT", reason); }
}

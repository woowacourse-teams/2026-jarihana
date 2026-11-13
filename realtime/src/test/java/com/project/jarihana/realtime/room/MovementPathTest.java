package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class MovementPathTest {
    private RoomState room() throws Exception {
        var mapper = JsonMapper.builder().build();
        var geometry = mapper.readTree("""
                {"building":{"minX":-20,"maxX":20,"minZ":-20,"maxZ":20},
                 "walls":[{"x":0,"z":0,"width":1,"depth":1}]}
                """);
        var layout = new RoomLayout(1, Map.of(), geometry, new Vec3(-1, 0, 0), mapper.readTree("{}"));
        var room = new RoomState("7", layout, 10, 100);
        room.join(TestRooms.admission("1"), "a", 1000);
        return room;
    }

    private List<Map<String, Object>> path(Vec3... corners) {
        List<Map<String, Object>> result = new ArrayList<>();
        result.add(point(corners[0]));
        for (int i = 1; i < corners.length; i++) {
            Vec3 from = corners[i - 1], to = corners[i];
            int count = (int) Math.ceil(from.distance(to) / .14);
            for (int step = 1; step <= count; step++) {
                double ratio = (double) step / count;
                result.add(point(new Vec3(from.x() + (to.x() - from.x()) * ratio, 0, from.z() + (to.z() - from.z()) * ratio)));
            }
        }
        return result;
    }
    private Map<String, Object> point(Vec3 value) { return Map.of("x", value.x(), "y", value.y(), "z", value.z()); }
    private Map<String, Object> payload(List<Map<String, Object>> path) {
        var value = new java.util.LinkedHashMap<String, Object>(path.getLast());
        value.put("yaw", 0); value.put("locomotion", "running"); value.put("path", path);
        return value;
    }

    @Test
    void delayedRouteAroundCornerPassesWhileStraightShortcutFails() throws Exception {
        var room = room();
        Vec3 start = new Vec3(-1, 0, 0), end = new Vec3(1, 0, 0);
        assertThatThrownBy(() -> room.move("1", "a", 1, payload(path(start, end)), 2000))
                .isInstanceOfSatisfying(RuleViolation.class, error -> assertThat(error.reason()).isEqualTo("BLOCKED_PATH"));
        var around = path(start, new Vec3(-1, 0, 1), new Vec3(1, 0, 1), end);
        assertThat(room.move("1", "a", 2, payload(around), 2000)).isTrue();
        assertThat(room.participants().getFirst().position()).isEqualTo(end);
    }

    @Test
    void halfSecondOfNormalWalkingCanExceedOldOnePointFiveMeterCap() throws Exception {
        var room = room();
        assertThat(room.move("1", "a", 1, payload(path(new Vec3(-1, 0, 0), new Vec3(-1, 0, 1.7))), 1500)).isTrue();
    }

    @Test
    void diagonalRunningUsesDisplacementOfEachAxisPair() throws Exception {
        var room = room();
        var route = path(new Vec3(-1, 0, 0), new Vec3(-3, 0, 2));
        assertThat(room.move("1", "a", 1, payload(route), 1500)).isTrue();
    }

    @Test
    void totalRouteLengthAndSameTimestampPacketsCannotMintSpeed() throws Exception {
        var room = room();
        Vec3 start = new Vec3(-1, 0, 0), far = new Vec3(-1, 0, 2);
        assertThatThrownBy(() -> room.move("1", "a", 1, payload(path(start, far, start)), 1100))
                .isInstanceOfSatisfying(RuleViolation.class, error -> assertThat(error.reason()).isEqualTo("SPEED_LIMIT"));
        room.move("1", "a", 2, payload(path(start, new Vec3(-1, 0, .2))), 1000);
        assertThatThrownBy(() -> room.move("1", "a", 3, payload(path(new Vec3(-1, 0, .2), new Vec3(-1, 0, .4))), 1000))
                .isInstanceOfSatisfying(RuleViolation.class, error -> assertThat(error.reason()).isEqualTo("SPEED_LIMIT"));
    }

    @Test
    void pathCannotStartElsewhereOrGrowWithoutLimit() throws Exception {
        var room = room();
        var disconnected = path(new Vec3(-5, 0, 0), new Vec3(-5, 0, .1));
        assertThatThrownBy(() -> room.move("1", "a", 1, payload(disconnected), 2000))
                .isInstanceOfSatisfying(RuleViolation.class, error -> assertThat(error.reason()).isEqualTo("PATH_START"));
        var oversized = java.util.Collections.nCopies(65, point(new Vec3(-1, 0, 0)));
        assertThatThrownBy(() -> room.move("1", "a", 2, payload(oversized), 2000))
                .isInstanceOfSatisfying(RuleViolation.class, error -> assertThat(error.reason()).isEqualTo("PATH_LIMIT"));
    }
}

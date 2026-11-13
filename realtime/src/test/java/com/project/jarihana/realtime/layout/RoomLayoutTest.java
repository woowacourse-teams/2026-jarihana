package com.project.jarihana.realtime.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class RoomLayoutTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final LayoutCatalog catalog = new LayoutCatalog(mapper);

    RoomLayoutTest() throws java.io.IOException {}

    @ParameterizedTest
    @ValueSource(strings = {"lounge", "climbing", "boardgame", "dining", "band", "study", "photo"})
    void everyTemplateHasAValidSpawnAndEntrancePath(String template) {
        RoomLayout layout = empty(template);
        assertThat(layout.spawn()).isEqualTo(new Vec3(-2, 0, 6.8));
        assertThat(layout.pathAllowed(layout.spawn(), new Vec3(-2, 0, 10), false)).isTrue();
        assertThat(layout.valid(new Vec3(10000, 0, 10000), false)).isFalse();
    }

    @ParameterizedTest
    @ValueSource(strings = {"climbing", "boardgame", "dining", "band", "study", "photo"})
    void stairsConnectGroundAndMezzanineWithoutTeleportation(String template) {
        RoomLayout layout = empty(template);
        var stairs = layout.geometry().path("stairs");
        double x = (stairs.path("minX").asDouble() + stairs.path("maxX").asDouble()) / 2;
        double fromZ = stairs.path("maxZ").asDouble() + .3;
        double endZ = stairs.path("minZ").asDouble() - .3;
        Vec3 from = new Vec3(x, 0, fromZ);
        for (double z = fromZ - .1; z >= endZ; z -= .1) {
            Vec3 candidate = new Vec3(x, from.y(), z);
            Vec3 next = new Vec3(x, layout.floorAt(candidate), z);
            assertThat(layout.pathAllowed(from, next, false)).as("%s staircase z=%s", template, z).isTrue();
            from = next;
        }
        assertThat(from.y()).isCloseTo(stairs.path("height").asDouble(), org.assertj.core.data.Offset.offset(.001));
        var mezzanine = layout.geometry().path("mezzanine");
        double centerX = (mezzanine.path("minX").asDouble() + mezzanine.path("maxX").asDouble()) / 2;
        double centerZ = (mezzanine.path("minZ").asDouble() + mezzanine.path("maxZ").asDouble()) / 2;
        assertThat(layout.pathAllowed(new Vec3(centerX, 0, centerZ), new Vec3(centerX, from.y(), centerZ), false)).isFalse();
        assertThat(layout.pathAllowed(new Vec3(centerX, from.y(), centerZ), new Vec3(centerX, 0, centerZ), false)).isFalse();
    }

    @Test
    void loungeWallsCannotBeCrossedEvenWhenEndpointsAreWalkable() {
        RoomLayout layout = empty("lounge");
        assertThat(layout.pathAllowed(new Vec3(-6, 0, 7), new Vec3(-6, 0, 4), false)).isFalse();
        assertThat(layout.pathAllowed(layout.spawn(), new Vec3(-2, 0, 2), false)).isTrue();
    }

    @Test
    void upperFurnitureDoesNotBlockTheFloorBelow() {
        RoomLayout layout = catalog.read(1, mapper.valueToTree(Map.of("version", 11, "template", "climbing", "items",
                List.of(Map.of("id", "upper", "kind", "table", "x", 4, "z", -10, "level", 1)))));
        assertThat(layout.valid(new Vec3(4, 0, -10), false)).isTrue();
        assertThat(layout.valid(new Vec3(4, layout.geometry().path("mezzanine").path("height").asDouble(), -10), false)).isFalse();
    }

    @Test
    void legacyLayoutsRequireAnExplicitEditorSave() {
        assertThatThrownBy(() -> catalog.read(1, mapper.valueToTree(Map.of("version", 8, "template", "lounge", "items", List.of()))))
                .hasMessage("LAYOUT_UPGRADE_REQUIRED");
    }

    private RoomLayout empty(String template) {
        return catalog.read(1, mapper.valueToTree(Map.of("version", 11, "template", template, "items", List.of())));
    }
}

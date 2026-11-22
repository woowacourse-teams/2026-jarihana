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
import tools.jackson.databind.JsonNode;

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
        RoomLayout layout = readFixture(1, mapper.valueToTree(Map.of("version", 11, "template", "climbing", "items",
                List.of(Map.of("id", "upper", "kind", "table", "x", 4, "z", -10, "level", 1)))));
        assertThat(layout.valid(new Vec3(4, 0, -10), false)).isTrue();
        assertThat(layout.valid(new Vec3(4, layout.geometry().path("mezzanine").path("height").asDouble(), -10), false)).isFalse();
    }

    @Test
    void readsLoftGeometryOnlyForSavedVersionTwelveLounges() {
        RoomLayout defaultLayout = readFixture(0, null);
        RoomLayout savedLayout = readFixture(1, mapper.valueToTree(Map.of(
                "version", 12, "template", "lounge", "items", List.of())));

        assertThat(defaultLayout.geometry()).isEqualTo(empty("lounge").geometry());
        assertThat(savedLayout.geometry().path("stairs").path("steps").asInt()).isPositive();
        assertThat(defaultLayout.geometry().path("stairs").isObject()).isFalse();
    }

    @Test
    void legacyLayoutsRequireAnExplicitEditorSave() {
        assertThatThrownBy(() -> readFixture(1, mapper.valueToTree(Map.of("version", 8, "template", "lounge", "items", List.of()))))
                .hasMessage("LAYOUT_UPGRADE_REQUIRED");
    }

    private RoomLayout empty(String template) {
        return readFixture(1, mapper.valueToTree(Map.of("version", 11, "template", template, "items", List.of())));
    }

    private RoomLayout readFixture(long revision, JsonNode room) {
        String key = room == null ? "11:lounge" : room.path("version").asInt() + ":" + room.path("template").asString();
        return catalog.read(revision, room, TestBlueprints.geometry(key));
    }

    @Test
    void savedDocumentVersionDoesNotOverridePinnedGeometry() {
        var room = mapper.valueToTree(Map.of("version", 11, "template", "lounge", "items", List.of()));
        var loft = TestBlueprints.geometry("12:lounge");
        assertThat(catalog.read(9, room, loft).geometry()).isEqualTo(loft);
    }

    @ParameterizedTest
    @ValueSource(strings = {"11:lounge", "11:climbing", "11:boardgame", "11:dining", "11:band", "11:study", "11:photo", "12:lounge"})
    void aRoomKeepsItsGeometryWhenTheEnvironmentMigrates(String key) {
        String[] parts = key.split(":");
        var document = mapper.valueToTree(Map.of("version", Integer.parseInt(parts[0]), "template", parts[1],
                "items", List.of(Map.of("id", "table", "kind", "table", "x", 2, "z", 3))));
        var before = catalog.readBundled(7, document);
        var after = catalog.read(7, document, TestBlueprints.geometry(key));
        assertThat(before.origin()).isEqualTo(RoomLayout.Origin.BUNDLED);
        assertThat(after.origin()).isEqualTo(RoomLayout.Origin.DATABASE);
        assertThat(before.geometry()).isEqualTo(after.geometry());
        assertThat(before.assets()).isEqualTo(after.assets());
    }

    @Test
    void unsavedRoomUsesTheSameBundledAndDatabaseBlueprint() {
        assertThat(catalog.readBundled(0, null).geometry()).isEqualTo(TestBlueprints.geometry("11:lounge"));
    }
}

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
    void raisedRotatedSeatCanOnlyBeReachedFromItsOwnFloor() {
        RoomLayout layout = readFixture(1, mapper.valueToTree(Map.of("version", 12, "template", "lounge", "items",
                List.of(Map.of("id", "sofa", "kind", "sofa", "x", 0, "z", -6.1, "level", 1,
                        "rotation", 1, "scaleX", 1.2, "scaleY", 2, "scaleZ", 1.5)))));
        RoomAsset seat = layout.asset("sofa", "seatable");
        double floor = layout.geometry().path("mezzanine").path("height").asDouble();
        Vec3 approach = new Vec3(1.6, floor, -6.1);

        assertThat(layout.valid(approach, false)).isTrue();
        assertThat(seat.seatReachable(approach)).isTrue();
        assertThat(seat.seatReachable(new Vec3(1.6, 0, -6.1))).isFalse();
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
        var blueprint = TestBlueprints.runtime(key);
        return catalog.read(revision, blueprint.document(room), blueprint, TestBlueprints.FURNITURE);
    }

    @Test
    void pinnedBlueprintDeterminesWhetherTheLoftIsWalkable() {
        var room = mapper.valueToTree(Map.of("version", 11, "template", "lounge", "items", List.of()));
        var flat = TestBlueprints.runtime("11:lounge");
        var loft = TestBlueprints.runtime("12:lounge");
        var mezzanine = loft.geometry().path("mezzanine");
        var upperFloor = new Vec3(
                (mezzanine.path("minX").asDouble() + mezzanine.path("maxX").asDouble()) / 2,
                mezzanine.path("height").asDouble(),
                (mezzanine.path("minZ").asDouble() + mezzanine.path("maxZ").asDouble()) / 2);

        assertThat(catalog.read(9, room, flat, TestBlueprints.FURNITURE).floorAt(upperFloor)).isZero();
        assertThat(catalog.read(9, room, loft, TestBlueprints.FURNITURE).floorAt(upperFloor)).isEqualTo(upperFloor.y());
    }

    @Test
    void unsavedRoomUsesTheProvidedBlueprintWithDefaultFurniture() {
        var blueprint = TestBlueprints.runtime("11:lounge");
        var layout = catalog.read(0, blueprint.document(null), blueprint, TestBlueprints.FURNITURE);
        assertThat(layout.geometry()).isEqualTo(blueprint.geometry());
        assertThat(blueprint.defaultRoom().path("items").size()).isEqualTo(24);
        assertThat(layout.assets()).containsKeys("meeting-table", "sofa", "entrance-bench", "room-general-light-switch");
        assertThat(TestBlueprints.runtime("12:lounge").defaultRoom().path("items").size()).isEqualTo(32);
        assertThat(layout.revision()).isZero();
    }

    @Test
    void environmentFurnitureDeterminesBlockingAndAttachedHeightEvenWhenRetired() {
        var room = mapper.readTree("""
                {"version":11,"items":[{"id":"p","kind":"table","x":0,"z":0},
                  {"id":"c","kind":"propCup","parentId":"p","surfaceIndex":0}]}
                """);
        var furniture = mapper.readTree("""
                {"table":{"width":8,"depth":6,"height":4,"surfaces":[3.7]},
                 "propCup":{"width":0.32,"depth":0.3,"height":0.2,"surfaces":[]}}
                """);
        var blueprint = new BlueprintRuntime(TestBlueprints.geometry("11:lounge"), new Vec3(4, 0, 6), room);
        var layout = catalog.read(37, blueprint.document(room), blueprint, furniture);
        assertThat(layout.arrival()).isEqualTo(new Vec3(4, 0, 6));
        assertThat(layout.revision()).isEqualTo(37);
        assertThat(layout.assets().get("p").blocks(new Vec3(3, 0, 0))).isTrue();
        assertThat(layout.assets().get("c").position().y()).isEqualTo(3.7);
    }
}

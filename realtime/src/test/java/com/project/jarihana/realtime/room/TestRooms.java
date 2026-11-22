package com.project.jarihana.realtime.room;

import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.layout.BlueprintRef;
import com.project.jarihana.realtime.layout.TestBlueprints;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.layout.LayoutCatalog;
import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class TestRooms {
    private TestRooms() {}

    public static RoomState room() {
        return new RoomState("7", layout(1, 0), 10, 100);
    }

    public static Admission admission(String memberId) {
        return new Admission("7", memberId, "사용자 " + memberId, "#536bd6", null, "MEMBER", 100000, 1, null, BlueprintRef.UNSAVED_ROOM);
    }

    public static RoomLayout layout(long revision, double sofaX) {
        return layout(revision, sofaX, 1, TestBlueprints.FURNITURE);
    }

    public static RoomLayout layout(long revision, double sofaX, long catalogGeneration, JsonNode furniture) {
        return layout(revision, sofaX, catalogGeneration, furniture, TestBlueprints.PORTABLE_ITEMS);
    }

    public static RoomLayout layout(long revision, double sofaX, long catalogGeneration, JsonNode furniture, JsonNode itemRules) {
        var mapper = JsonMapper.builder().build();
        var items = List.of(
                Map.of("id", "sofa", "kind", "sofa", "x", sofaX, "z", 0, "rotation", 0),
                Map.of("id", "shelf", "kind", "pantryShelf", "x", 1, "z", 0, "rotation", 0),
                Map.of("id", "table", "kind", "table", "x", 0, "z", 1, "rotation", 0),
                Map.of("id", "machine", "kind", "cafeCounter", "x", -1, "z", 0, "rotation", 0));
        LayoutCatalog catalog = new LayoutCatalog();
        RoomLayout source = catalog.read(revision, catalogGeneration, mapper.valueToTree(Map.of("version", 11, "template", "lounge", "items", items)),
                TestBlueprints.runtime("11:lounge"), furniture, itemRules);
        return new RoomLayout(revision, catalogGeneration, source.assets(),
                mapper.readTree("{\"building\":{\"minX\":-20,\"maxX\":20,\"minZ\":-20,\"maxZ\":20},\"walls\":[]}"),
                new Vec3(0, 0, 2.4), source.itemRules());
    }
}

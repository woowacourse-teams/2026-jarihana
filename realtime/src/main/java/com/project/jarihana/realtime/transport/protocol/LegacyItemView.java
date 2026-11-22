package com.project.jarihana.realtime.transport.protocol;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.room.domain.ItemState;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.io.IOException;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Projects attachment references for WebSocket v1 clients that render serialized positions. */
public final class LegacyItemView {
    private static final JsonNode ANCHORS = readAnchors();

    private LegacyItemView() {}

    public static ItemState project(ItemState item, RoomLayout layout) {
        if (!item.attached()) return item;
        RoomAsset asset = layout.assets().get(item.assetId());
        Vec3 local = item.location() == ItemState.Location.STORAGE
                ? storagePosition(asset, item.slot()) : surfacePosition(asset, item.slot());
        return new ItemState(item.id(), item.kind(), item.holderId(), item.sourceAssetId(), item.location(),
                asset.world(local), item.assetId(), item.slot(), item.remaining(), item.velocity(), item.startedAt());
    }

    private static Vec3 surfacePosition(RoomAsset asset, int slot) {
        JsonNode anchor = ANCHORS.path(asset.kind()).path(slot);
        return new Vec3(anchor.path("x").asDouble(0), anchor.path("y").asDouble(asset.height()),
                anchor.path("z").asDouble(0));
    }

    private static Vec3 storagePosition(RoomAsset asset, int slot) {
        int capacity = asset.storageCapacity();
        double x = (slot - (capacity - 1) / 2.0) * Math.min(0.28, asset.width() / capacity);
        double y = ANCHORS.path(asset.kind()).path(0).path("y").asDouble(Math.min(asset.height(), 1.2));
        return new Vec3(x, y, 0);
    }

    private static JsonNode readAnchors() {
        try (var input = new ClassPathResource("contracts/legacy-surface-anchors.json").getInputStream()) {
            return new JsonMapper().readTree(input);
        } catch (IOException error) {
            throw new IllegalStateException("Legacy item positions could not be loaded", error);
        }
    }
}

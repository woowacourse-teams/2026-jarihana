package com.project.jarihana.realtime.room.domain;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.layout.RoomLayout;
import java.util.HashMap;
import java.util.Map;

final class LayoutReconciliation {
    void apply(RoomState room, RoomLayout next, long now) {
        RoomLayout previous = room.layout();
        Map<String, ItemState> heldItems = new HashMap<>();
        for (ItemState item : room.items()) {
            if (!next.itemCapability(item.kind(), "portable") || item.attached() && !attachmentExists(previous, next, item)) {
                room.removeItem(item.id());
            } else if (item.location() == ItemState.Location.THROWN && !next.itemCapability(item.kind(), "throwable")) {
                Vec3 point = item.thrownPosition(Math.max(0, now - item.startedAt()) / 1000.0);
                room.put(item.dropAt(next.safe(point)));
            } else if (item.location() == ItemState.Location.WORLD && !next.valid(item.position(), false)) {
                room.put(item.dropAt(next.safe(item.position())));
            } else if (item.location() == ItemState.Location.HELD) {
                heldItems.put(item.id(), item);
            }
        }
        for (ParticipantState actor : room.participants()) {
            ParticipantState updated = actor;
            boolean jumping = previous.revision() == next.revision() && actor.locomotion().equals("jumping");
            if (!next.valid(actor.position(), jumping) ||
                    (actor.seat() != null && !seatExists(previous, next, actor))) {
                updated = actor.stand(next.safe(actor.position()), now);
            }
            if (updated.heldItemId() != null) {
                ItemState held = heldItems.get(updated.heldItemId());
                if (held == null) updated = updated.hold(null);
                else if (updated.pose().equals("drinking") && !next.canDrink(held.kind())) updated = updated.withPose("relaxed");
            }
            room.put(updated);
        }
        Map<String, AssetState> assets = new HashMap<>();
        for (Map.Entry<String, AssetState> entry : room.assetStates().entrySet()) {
            RoomAsset oldAsset = previous.assets().get(entry.getKey());
            RoomAsset asset = next.assets().get(entry.getKey());
            if (asset == null || oldAsset == null || !asset.samePlacement(oldAsset)) continue;
            AssetState state = entry.getValue();
            AssetState.Production production = state.production();
            if (production != null && (!asset.has("producer") || !asset.products().contains(production.kind()) ||
                    !next.itemCapability(production.kind(), "portable") ||
                    asset.productionMs() != oldAsset.productionMs() || room.items().stream().noneMatch(item ->
                            item.id().equals(production.itemId()) && asset.id().equals(item.assetId()) &&
                            item.location() == ItemState.Location.SURFACE))) {
                state = state.producing(null);
            }
            AssetState updated = new AssetState(asset.has("openable") && state.open(),
                    !asset.has("switchable") || state.on(), asset.has("careable") ? state.wateredAt() : 0, state.production());
            if (!updated.equals(AssetState.initial())) assets.put(entry.getKey(), updated);
        }
        room.assetStates().keySet().forEach(room::removeAssetState);
        assets.forEach(room::put);
    }

    private boolean seatExists(RoomLayout previous, RoomLayout next, ParticipantState actor) {
        String id = actor.seat().assetId();
        RoomAsset oldAsset = previous.assets().get(id);
        RoomAsset asset = next.assets().get(id);
        return asset != null && oldAsset != null && asset.samePlacement(oldAsset) && asset.has("seatable") &&
                actor.seat().slot() < asset.seatCount() && asset.seatReachable(actor.position());
    }

    private boolean attachmentExists(RoomLayout previous, RoomLayout next, ItemState item) {
        RoomAsset oldAsset = previous.assets().get(item.assetId());
        RoomAsset nextAsset = next.assets().get(item.assetId());
        if (nextAsset == null || oldAsset == null || !oldAsset.kind().equals(nextAsset.kind())) return false;
        if (item.location() == ItemState.Location.STORAGE) {
            return nextAsset.has("storage") && item.slot() < nextAsset.storageCapacity() && nextAsset.supplies().contains(item.kind());
        }
        return nextAsset.has("surface") && item.slot() < nextAsset.surfaceSlots();
    }

}

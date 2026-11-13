package com.project.jarihana.realtime.room.domain;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.layout.RoomLayout;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

final class LayoutReconciliation {
    void apply(RoomState room, RoomLayout next, long now) {
        List<ParticipantState> participants = new ArrayList<>();
        List<ItemState> items = new ArrayList<>();
        Map<String, AssetState> assets = new HashMap<>();
        for (ParticipantState actor : room.participants()) {
            ParticipantState updated = actor;
            if (actor.seat() != null && changed(room.layout(), next, actor.seat().assetId())) {
                updated = actor.stand(next.safe(actor.seat().approach()), now);
            } else if (actor.seat() == null && !next.valid(actor.position(), false)) {
                updated = actor.stand(next.safe(actor.position()), now);
            }
            participants.add(updated);
        }
        for (ItemState item : room.items()) {
            if (item.location() == ItemState.Location.HELD) { items.add(item); continue; }
            RoomAsset oldAsset = item.assetId() == null ? null : room.layout().assets().get(item.assetId());
            RoomAsset nextAsset = item.assetId() == null ? null : next.assets().get(item.assetId());
            boolean attached = item.location() == ItemState.Location.SURFACE || item.location() == ItemState.Location.STORAGE;
            String capability = item.location() == ItemState.Location.STORAGE ? "storage" : "surface";
            boolean storage = item.location() == ItemState.Location.STORAGE;
            boolean compatible = attached && oldAsset != null && nextAsset != null && oldAsset.kind().equals(nextAsset.kind()) &&
                    nextAsset.has(capability) && item.slot() != null && item.slot() >= 0 &&
                    item.slot() < (storage ? nextAsset.slots() : nextAsset.surfaces().size()) &&
                    (!storage || nextAsset.supplies().contains(item.kind()));
            if (compatible) {
                items.add(item.place(item.location(), storage ? nextAsset.storage(item.slot()) : nextAsset.surface(item.slot()), item.assetId(), item.slot()));
            } else if (attached || item.location() == ItemState.Location.THROWN || !next.valid(item.position(), false)) {
                items.add(item.place(ItemState.Location.WORLD, next.safe(item.position()), null, null));
            } else items.add(item);
        }
        for (Map.Entry<String, AssetState> entry : room.assetStates().entrySet()) {
            if (!next.assets().containsKey(entry.getKey())) continue;
            AssetState state = entry.getValue();
            if (changed(room.layout(), next, entry.getKey())) state = AssetState.initial();
            assets.put(entry.getKey(), state);
        }
        participants.forEach(room::put);
        items.forEach(room::put);
        room.assetStates().keySet().forEach(room::removeAssetState);
        assets.forEach(room::put);
    }

    private boolean changed(RoomLayout previous, RoomLayout next, String id) {
        return !Objects.equals(previous.assets().get(id), next.assets().get(id));
    }
}

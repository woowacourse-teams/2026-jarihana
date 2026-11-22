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
        Map<String, AssetState> assets = new HashMap<>();
        for (ParticipantState actor : room.participants()) {
            ParticipantState updated = actor;
            if (!next.valid(actor.position(), false) ||
                    (actor.seat() != null && changed(room.layout(), next, actor.seat().assetId()))) {
                updated = actor.stand(next.safe(actor.position()), now);
            }
            participants.add(updated);
        }
        for (ItemState item : room.items()) {
            if (item.attached() && !attachmentExists(room.layout(), next, item)) {
                room.removeItem(item.id());
            } else if (item.location() == ItemState.Location.WORLD && !next.valid(item.position(), false)) {
                room.put(item.dropAt(next.safe(item.position())));
            }
        }
        for (Map.Entry<String, AssetState> entry : room.assetStates().entrySet()) {
            if (!next.assets().containsKey(entry.getKey())) continue;
            AssetState state = entry.getValue();
            if (changed(room.layout(), next, entry.getKey())) state = AssetState.initial();
            assets.put(entry.getKey(), state);
        }
        participants.forEach(room::put);
        room.assetStates().keySet().forEach(room::removeAssetState);
        assets.forEach(room::put);
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

    private boolean changed(RoomLayout previous, RoomLayout next, String id) {
        return !Objects.equals(previous.assets().get(id), next.assets().get(id));
    }
}

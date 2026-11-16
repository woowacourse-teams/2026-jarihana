package com.project.jarihana.realtime.interaction;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.room.domain.AssetState;
import com.project.jarihana.realtime.room.domain.ItemState;
import com.project.jarihana.realtime.room.domain.ParticipantState;
import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import com.project.jarihana.realtime.transport.protocol.Values;
import java.util.Map;
import java.util.UUID;

final class ItemInteractions {
    void take(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        emptyHands(actor);
        RoomAsset asset = InteractionService.nearby(room, actor, payload, "storage");
        openStorage(room, asset);
        String kind = Values.text(payload, "kind");
        if (!asset.supplies().contains(kind) || !room.layout().itemCapability(kind, "portable")) throw new RuleViolation("INVALID_ITEM_KIND");
        ItemState stored = room.items().stream().filter(item -> asset.id().equals(item.assetId()) &&
                item.location() == ItemState.Location.STORAGE && item.kind().equals(kind)).findFirst().orElse(null);
        if (stored == null) {
            long existing = room.items().stream().filter(item -> asset.id().equals(item.sourceAssetId())).count();
            if (existing >= asset.slots()) throw new RuleViolation("STORAGE_EMPTY");
            stored = new ItemState(UUID.randomUUID().toString(), kind, actor.memberId(), asset.id(), ItemState.Location.HELD,
                    actor.position(), null, null, kind.equals("cup") ? 0 : 1, null, 0);
        }
        room.put(stored.hold(actor));
        room.put(actor.hold(stored.id()));
    }

    void pickup(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        emptyHands(actor);
        ItemState item = room.item(Values.text(payload, "itemId"));
        if (!room.layout().itemCapability(item.kind(), "portable")) throw new RuleViolation("NOT_PORTABLE");
        if (item.holderId() != null || item.location() == ItemState.Location.THROWN) throw new RuleViolation("OCCUPIED");
        if (item.location() == ItemState.Location.SURFACE) {
            RoomAsset asset = room.layout().asset(item.assetId(), "surface");
            if (!asset.surfaceReachable(actor.position())) throw new RuleViolation("TOO_FAR");
        } else if (item.position().distance(actor.position()) > 3) {
            throw new RuleViolation("TOO_FAR");
        }
        if (item.location() == ItemState.Location.STORAGE) {
            RoomAsset asset = room.layout().asset(item.assetId(), "storage");
            openStorage(room, asset);
        }
        if (item.assetId() != null) {
            AssetState.Production production = room.assetState(item.assetId()).production();
            if (production != null && production.itemId().equals(item.id())) throw new RuleViolation("BUSY");
        }
        room.put(item.hold(actor));
        room.put(actor.hold(item.id()));
    }

    void place(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        ItemState item = held(room, actor, payload);
        RoomAsset asset = InteractionService.nearby(room, actor, payload, "surface");
        int slot = payload.containsKey("slot") ? Values.slot(payload) : InteractionService.freeSlot(room, asset);
        Vec3 point = asset.surface(slot);
        if (room.items().stream().anyMatch(other -> other.location() == ItemState.Location.SURFACE &&
                asset.id().equals(other.assetId()) && other.slot() != null && other.slot() == slot)) {
            throw new RuleViolation("OCCUPIED");
        }
        room.put(item.place(ItemState.Location.SURFACE, point, asset.id(), slot));
        room.put(actor.hold(null));
    }

    void drop(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        ItemState item = held(room, actor, payload);
        Vec3 point = room.layout().safe(actor.position().add(new Vec3(Math.sin(actor.yaw()) * 0.6, 0, -Math.cos(actor.yaw()) * 0.6)));
        room.put(item.place(ItemState.Location.WORLD, point, null, null));
        room.put(actor.hold(null));
    }

    void throwItem(RoomState room, ParticipantState actor, Map<String, Object> payload, long now) {
        ItemState item = held(room, actor, payload);
        if (!room.layout().itemCapability(item.kind(), "throwable")) throw new RuleViolation("NOT_THROWABLE");
        Vec3 velocity = payload.containsKey("velocity") ? Values.point(Values.object(payload.get("velocity"))) :
                new Vec3(Math.sin(actor.yaw()) * 5, 3, -Math.cos(actor.yaw()) * 5);
        if (Math.hypot(velocity.x(), velocity.z()) > 8 || velocity.y() < 0 || velocity.y() > 6) throw new RuleViolation("INVALID_THROW");
        room.put(new ItemState(item.id(), item.kind(), null, item.sourceAssetId(), ItemState.Location.THROWN,
                actor.position().add(new Vec3(0, 0.8, 0)), null, null, item.remaining(), velocity, now));
        room.put(actor.hold(null));
    }

    void consume(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        ItemState item = held(room, actor, payload);
        if (!room.layout().itemCapability(item.kind(), "consumable") || item.remaining() <= 0) {
            throw new RuleViolation("NOT_CONSUMABLE");
        }
        String emptyKind = room.layout().emptyKind(item.kind());
        ItemState updated = item.consume(emptyKind);
        if (emptyKind == null && updated.remaining() == 0) {
            room.removeItem(item.id());
            room.put(actor.hold(null));
        } else room.put(updated);
    }

    void returnItem(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        ItemState item = held(room, actor, payload);
        RoomAsset asset = InteractionService.nearby(room, actor, payload, "storage");
        openStorage(room, asset);
        if (!asset.supplies().contains(item.kind())) throw new RuleViolation("INVALID_ITEM_KIND");
        int slot = InteractionService.freeSlot(room, asset, true);
        room.put(item.place(ItemState.Location.STORAGE, asset.storage(slot), asset.id(), slot));
        room.put(actor.hold(null));
    }

    private static ItemState held(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        if (actor.heldItemId() == null) throw new RuleViolation("ITEM_REQUIRED");
        if (payload.containsKey("itemId") && !actor.heldItemId().equals(Values.text(payload, "itemId"))) throw new RuleViolation("STALE_ITEM");
        ItemState item = room.item(actor.heldItemId());
        if (!actor.memberId().equals(item.holderId())) throw new RuleViolation("NOT_OWNER");
        return item;
    }

    private static void emptyHands(ParticipantState actor) {
        if (actor.heldItemId() != null) throw new RuleViolation("HANDS_FULL");
    }

    private static void openStorage(RoomState room, RoomAsset asset) {
        if (asset.has("openable") && !room.assetState(asset.id()).open()) throw new RuleViolation("STORAGE_CLOSED");
    }
}

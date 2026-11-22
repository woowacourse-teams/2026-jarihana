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
import java.util.Set;
import java.util.UUID;

public final class InteractionService {
    private enum Action { SIT, STAND, POSE, TAKE, PICKUP, PLACE, DROP, THROW, CONSUME, RETURN,
        OPEN, CLOSE, PRODUCE, CANCEL_PRODUCTION, TOGGLE, WATER, EMOTE }
    private final ItemInteractions itemActions = new ItemInteractions();

    public void execute(RoomState room, ParticipantState actor, Map<String, Object> payload, long now) {
        Action action;
        try { action = Action.valueOf(Values.text(payload, "action")); }
        catch (IllegalArgumentException error) { throw new RuleViolation("UNSUPPORTED_ACTION"); }
        switch (action) {
            case SIT -> sit(room, actor, payload);
            case STAND -> room.put(actor.stand(room.layout().safe(actor.position()), now));
            case POSE -> pose(room, actor, payload);
            case TAKE -> itemActions.take(room, actor, payload);
            case PICKUP -> itemActions.pickup(room, actor, payload);
            case PLACE -> itemActions.place(room, actor, payload);
            case DROP -> itemActions.drop(room, actor, payload);
            case THROW -> itemActions.throwItem(room, actor, payload, now);
            case CONSUME -> itemActions.consume(room, actor, payload);
            case RETURN -> itemActions.returnItem(room, actor, payload);
            case OPEN, CLOSE -> opened(room, actor, payload, action == Action.OPEN);
            case PRODUCE -> produce(room, actor, payload, now);
            case CANCEL_PRODUCTION -> cancelProduction(room, actor, payload);
            case TOGGLE -> toggle(room, actor, payload);
            case WATER -> water(room, actor, payload, now);
            case EMOTE -> emote(room, actor, payload, now);
        }
    }

    private void sit(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        RoomAsset asset = room.layout().asset(Values.text(payload, "assetId"), "seatable");
        Vec3 current = actor.position();
        Vec3 approach = new Vec3(current.x(), room.layout().floorAt(current), current.z());
        if (!asset.seatReachable(approach)) throw new RuleViolation("TOO_FAR");
        if (!room.layout().valid(approach, false)) throw new RuleViolation("NO_SAFE_POSITION");
        int slot = Values.slot(payload);
        if (slot >= asset.seatCount()) throw new RuleViolation("INVALID_SLOT");
        if (room.participants().stream().anyMatch(other -> !other.memberId().equals(actor.memberId()) && other.seat() != null &&
                other.seat().assetId().equals(asset.id()) && other.seat().slot() == slot)) throw new RuleViolation("OCCUPIED");
        room.put(actor.sit(new ParticipantState.Seat(asset.id(), slot), approach));
    }

    private void pose(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        String pose = Values.text(payload, "pose");
        if (actor.seat() == null || !Set.of("relaxed", "reading", "drinking").contains(pose)) throw new RuleViolation("INVALID_POSE");
        if (pose.equals("reading") && (actor.heldItemId() == null || !room.item(actor.heldItemId()).kind().equals("book"))) {
            throw new RuleViolation("ITEM_REQUIRED");
        }
        if (pose.equals("drinking") && (actor.heldItemId() == null || !Set.of("cup", "coffee", "latte", "tea").contains(room.item(actor.heldItemId()).kind()))) {
            throw new RuleViolation("ITEM_REQUIRED");
        }
        room.put(actor.withPose(pose));
    }

    private void opened(RoomState room, ParticipantState actor, Map<String, Object> payload, boolean open) {
        RoomAsset asset = nearby(room, actor, payload, "openable");
        room.put(asset.id(), room.assetState(asset.id()).opened(open));
    }

    private void toggle(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        RoomAsset asset = nearby(room, actor, payload, "switchable");
        room.put(asset.id(), room.assetState(asset.id()).switched());
    }

    private void water(RoomState room, ParticipantState actor, Map<String, Object> payload, long now) {
        RoomAsset asset = nearby(room, actor, payload, "careable");
        AssetState state = room.assetState(asset.id());
        if (state.wateredAt() > 0 && now - state.wateredAt() < asset.cooldownMs()) throw new RuleViolation("COOLDOWN");
        room.put(asset.id(), state.watered(now));
    }

    private void emote(RoomState room, ParticipantState actor, Map<String, Object> payload, long now) {
        String kind = Values.text(payload, "kind");
        if (!Set.of("wave", "hello", "cheer").contains(kind)) throw new RuleViolation("INVALID_EMOTE");
        if (actor.emote() != null && now - actor.emote().startedAt() < 1000) throw new RuleViolation("COOLDOWN");
        room.put(actor.withEmote(new ParticipantState.Emote(kind, now, now + 3000)));
    }

    private void produce(RoomState room, ParticipantState actor, Map<String, Object> payload, long now) {
        RoomAsset asset = nearby(room, actor, payload, "producer");
        String kind = Values.text(payload, "kind");
        if (!asset.products().contains(kind)) throw new RuleViolation("INVALID_ITEM_KIND");
        AssetState state = room.assetState(asset.id());
        if (state.production() != null) throw new RuleViolation("BUSY");
        String itemId = payload.containsKey("itemId") ? Values.text(payload, "itemId") : actor.heldItemId();
        if (itemId == null) throw new RuleViolation("CUP_REQUIRED");
        ItemState item = room.item(itemId);
        if (!item.kind().equals("cup")) throw new RuleViolation("CUP_REQUIRED");
        boolean held = actor.memberId().equals(item.holderId());
        if (!held && !(item.location() == ItemState.Location.SURFACE && asset.id().equals(item.assetId()))) {
            throw new RuleViolation("NOT_OWNER");
        }
        if (held) {
            int slot = freeSlot(room, asset);
            room.put(item.attach(ItemState.Location.SURFACE, asset.id(), slot));
            room.put(actor.hold(null));
        }
        room.put(asset.id(), state.producing(new AssetState.Production(UUID.randomUUID().toString(), item.id(), kind,
                now, now + asset.productionMs(), actor.memberId())));
    }

    private void cancelProduction(RoomState room, ParticipantState actor, Map<String, Object> payload) {
        RoomAsset asset = nearby(room, actor, payload, "producer");
        AssetState state = room.assetState(asset.id());
        if (state.production() != null && !state.production().memberId().equals(actor.memberId()) && !actor.role().equals("LEADER")) {
            throw new RuleViolation("NOT_OWNER");
        }
        room.put(asset.id(), state.producing(null));
    }

    static RoomAsset nearby(RoomState room, ParticipantState actor, Map<String, Object> payload, String capability) {
        RoomAsset asset = room.layout().asset(Values.text(payload, "assetId"), capability);
        boolean usesSurface = capability.equals("surface") || capability.equals("producer");
        if (!(usesSurface ? asset.surfaceReachable(actor.position()) : asset.reachable(actor.position()))) {
            throw new RuleViolation("TOO_FAR");
        }
        return asset;
    }

    static int freeSlot(RoomState room, RoomAsset asset) {
        return freeSlot(room, asset, ItemState.Location.SURFACE);
    }

    static int freeSlot(RoomState room, RoomAsset asset, ItemState.Location location) {
        int count = location == ItemState.Location.STORAGE ? asset.storageCapacity() : asset.surfaceSlots();
        for (int slot = 0; slot < count; slot++) {
            if (!occupied(room, asset.id(), location, slot)) return slot;
        }
        throw new RuleViolation("SURFACE_FULL");
    }

    static boolean occupied(RoomState room, String assetId, ItemState.Location location, int slot) {
        return room.items().stream().anyMatch(item -> item.location() == location &&
                assetId.equals(item.assetId()) && Integer.valueOf(slot).equals(item.slot()));
    }
}

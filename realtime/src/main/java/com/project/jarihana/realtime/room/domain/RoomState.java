package com.project.jarihana.realtime.room.domain;

import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.interaction.InteractionService;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.transport.protocol.Values;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/** Mutable state is confined to this room's serial executor. All published values are copies. */
public final class RoomState {
    private final String roomId;
    private final String epoch = UUID.randomUUID().toString();
    private final int capacity;
    private final int maxItems;
    private final Map<String, ParticipantState> participants = new LinkedHashMap<>();
    private final Map<String, ItemState> items = new LinkedHashMap<>();
    private final Map<String, AssetState> assets = new LinkedHashMap<>();
    private record MoveBudget(double remaining, long updatedAt) {}
    private final Map<String, MoveBudget> movementBudgets = new LinkedHashMap<>();
    private final InteractionService interactions = new InteractionService();
    private RoomLayout layout;
    private long controlSeq;
    private long frameSeq;

    public RoomState(String roomId, RoomLayout layout, int capacity, int maxItems) {
        this.roomId = roomId;
        this.layout = layout;
        this.capacity = capacity;
        this.maxItems = maxItems;
    }

    public void join(Admission admission, String generation, long now) {
        if (!roomId.equals(admission.roomId()) || admission.leaseExpiresAt() <= now) throw new RuleViolation("ACCESS_DENIED");
        ParticipantState previous = participants.get(admission.memberId());
        if (previous == null && participants.size() >= capacity) throw new RuleViolation("ROOM_FULL");
        ParticipantState joined = previous == null
                ? ParticipantState.join(admission, generation, layout.spawn(participants.values().stream().map(ParticipantState::position).toList()), now)
                : previous.reconnect(admission, generation, now);
        if (previous != null && previous.seat() == null) joined = joined.stand(layout.safe(previous.position()), now);
        participants.put(admission.memberId(), joined);
        movementBudgets.put(admission.memberId(), new MoveBudget(0.25, now));
        controlSeq++;
    }

    public boolean leave(String memberId, String generation, long now) {
        ParticipantState actor = participants.get(memberId);
        if (actor == null || !actor.connectionGeneration().equals(generation)) return false;
        if (actor.heldItemId() != null) {
            ItemState item = items.get(actor.heldItemId());
            if (item != null) items.put(item.id(), item.place(ItemState.Location.WORLD, layout.safe(actor.position()), null, null));
        }
        for (Map.Entry<String, AssetState> entry : assets.entrySet()) {
            AssetState.Production production = entry.getValue().production();
            if (production != null && production.memberId().equals(memberId)) entry.setValue(entry.getValue().producing(null));
        }
        participants.remove(memberId);
        movementBudgets.remove(memberId);
        controlSeq++;
        return true;
    }

    public ParticipantState actor(String memberId, String generation, long now) {
        ParticipantState actor = participants.get(memberId);
        if (actor == null || !actor.connectionGeneration().equals(generation)) throw new RuleViolation("CONNECTION_REPLACED");
        if (actor.leaseExpiresAt() <= now) throw new RuleViolation("ACCESS_EXPIRED");
        return actor;
    }

    public boolean renew(Admission admission, String generation, long now) {
        ParticipantState actor = actor(admission.memberId(), generation, now);
        if (!roomId.equals(admission.roomId()) || admission.leaseExpiresAt() <= now) throw new RuleViolation("ACCESS_DENIED");
        participants.put(actor.memberId(), actor.renew(admission));
        boolean changed = !actor.displayName().equals(admission.displayName())
                || !actor.avatarColor().equals(admission.avatarColor())
                || !Objects.equals(actor.avatarAppearance(), admission.avatarAppearance());
        if (changed) controlSeq++;
        return changed;
    }

    public boolean move(String memberId, String generation, long seq, Map<String, Object> payload, long now) {
        ParticipantState actor = actor(memberId, generation, now);
        if (seq <= actor.lastMoveSeq()) return false;
        if (actor.seat() != null) throw new RuleViolation("SEATED");
        Vec3 point = Values.point(payload);
        double yaw = Values.number(payload, "yaw");
        String motion = Values.text(payload, "locomotion");
        if (!Set.of("idle", "walking", "running", "jumping").contains(motion) || Math.abs(yaw) > Math.PI * 10000) {
            throw new RuleViolation("INVALID_MOVEMENT", "INVALID_POSE");
        }
        MoveBudget previous = movementBudgets.get(memberId);
        // At most one second of delayed running plus the initial 25 cm tolerance.
        double available = Math.min(6.05, previous.remaining() + 5.8 * Math.max(0, now - previous.updatedAt()) / 1000.0);
        double horizontal = MovementPath.distance(layout, actor.position(), point, motion.equals("jumping"), payload);
        if (horizontal > available + 0.000001) {
            throw new RuleViolation("INVALID_MOVEMENT", "SPEED_LIMIT");
        }
        participants.put(memberId, actor.move(point, yaw, motion, seq, now));
        movementBudgets.put(memberId, new MoveBudget(available - horizontal, now));
        frameSeq++;
        return true;
    }

    public void command(String memberId, String generation, Map<String, Object> payload, long now) {
        interactions.execute(this, actor(memberId, generation, now), payload, now);
        controlSeq++;
    }

    public boolean tick(long now) {
        boolean changed = false;
        for (ParticipantState actor : new ArrayList<>(participants.values())) {
            if (actor.emote() != null && actor.emote().expiresAt() <= now) {
                participants.put(actor.memberId(), actor.withEmote(null));
                changed = true;
            }
        }
        for (ItemState item : new ArrayList<>(items.values())) {
            if (item.location() != ItemState.Location.THROWN) continue;
            double seconds = (now - item.startedAt()) / 1000.0;
            Vec3 point = item.position().add(item.velocity().scale(seconds)).add(new Vec3(0, -9 * seconds * seconds, 0));
            if (point.y() <= layout.floorAt(point) || seconds >= 3) {
                items.put(item.id(), item.place(ItemState.Location.WORLD, layout.safe(point), null, null));
                changed = true;
            }
        }
        for (Map.Entry<String, AssetState> entry : assets.entrySet()) {
            AssetState.Production production = entry.getValue().production();
            if (production == null || production.completesAt() > now) continue;
            ItemState item = items.get(production.itemId());
            if (item != null && entry.getKey().equals(item.assetId()) && item.kind().equals("cup")) {
                items.put(item.id(), item.fill(production.kind()));
            }
            entry.setValue(entry.getValue().producing(null));
            changed = true;
        }
        if (changed) controlSeq++;
        return changed;
    }

    public boolean replaceLayout(RoomLayout next, long now) {
        if (next.revision() <= layout.revision()) return false;
        new LayoutReconciliation().apply(this, next, now);
        layout = next;
        controlSeq++;
        return true;
    }

    public Map<String, Object> snapshot(String type, String memberId, String generation, long now) {
        Map<String, Object> result = context(type, memberId, generation, now);
        result.put("participants", participants.values().stream().map(ParticipantState::view).toList());
        result.put("items", List.copyOf(items.values()));
        result.put("assets", Map.copyOf(assets));
        return result;
    }

    public Map<String, Object> context(String type, String memberId, String generation, long now) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("type", type);
        result.put("protocolVersion", 1);
        result.put("roomId", roomId);
        result.put("roomEpoch", epoch);
        result.put("connectionGeneration", generation);
        result.put("layoutRevision", layout.revision());
        result.put("controlSeq", controlSeq);
        result.put("frameSeq", frameSeq);
        result.put("serverTime", now);
        result.put("selfId", memberId);
        return result;
    }

    public Map<String, Object> movement(String memberId, String generation, long now) {
        Map<String, Object> result = context("MOVEMENT_FRAME", memberId, generation, now);
        result.put("participants", participants.values().stream().map(actor -> Map.of("memberId", actor.memberId(),
                "position", actor.position(), "yaw", actor.yaw(), "locomotion", actor.locomotion())).toList());
        return result;
    }

    public void put(ParticipantState participant) { participants.put(participant.memberId(), participant); }
    public void put(ItemState item) {
        if (!items.containsKey(item.id()) && items.size() >= maxItems) throw new RuleViolation("ITEM_LIMIT");
        items.put(item.id(), item);
    }
    public void put(String assetId, AssetState state) { assets.put(assetId, state); }
    public void removeItem(String id) { items.remove(id); }
    public void removeAssetState(String id) { assets.remove(id); }
    public ItemState item(String id) {
        ItemState item = items.get(id);
        if (item == null) throw new RuleViolation("ITEM_NOT_FOUND");
        return item;
    }
    public AssetState assetState(String id) { return assets.getOrDefault(id, AssetState.initial()); }
    public List<ParticipantState> participants() { return List.copyOf(participants.values()); }
    public List<ItemState> items() { return List.copyOf(items.values()); }
    public Map<String, AssetState> assetStates() { return Map.copyOf(assets); }
    public RoomLayout layout() { return layout; }
    public String epoch() { return epoch; }
    public String roomId() { return roomId; }
    public long layoutRevision() { return layout.revision(); }
    public long frameSeq() { return frameSeq; }
}

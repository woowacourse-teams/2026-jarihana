package com.project.jarihana.realtime.room.runtime;

import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.room.domain.ParticipantState;
import com.project.jarihana.realtime.room.domain.RoomState;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.transport.protocol.Values;
import com.project.jarihana.realtime.transport.websocket.Peer;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

public final class RoomRuntime {
    private record CachedResult(Map<String, Object> result, long expiresAt) {}
    private final RoomState state;
    private final RoomExecutor mailbox;
    private final Clock clock;
    private final long graceMs;
    private final Runnable remove;
    private final Map<String, Peer> peers = new ConcurrentHashMap<>();
    private final Map<String, LinkedHashMap<String, CachedResult>> results = new LinkedHashMap<>();
    private final Map<String, AtomicReference<Map<String, Object>>> pendingMoves = new ConcurrentHashMap<>();
    private final AtomicBoolean ticking = new AtomicBoolean();
    private final AtomicBoolean refreshing = new AtomicBoolean();
    private final AtomicInteger pendingJoins = new AtomicInteger();
    private long lastFrame;
    private boolean hasJoined;
    private final long createdAt;
    private volatile boolean closed;

    public RoomRuntime(String roomId, RoomLayout layout, RealtimeProperties properties, Executor pool, Clock clock, Runnable remove) {
        state = new RoomState(roomId, layout, properties.roomCapacity(), properties.maxItems());
        this.clock = clock;
        createdAt = clock.millis();
        graceMs = properties.reconnectGraceMs();
        this.remove = remove;
        mailbox = new RoomExecutor(pool, properties.roomQueueCapacity(), error -> terminate("ROOM_FAILURE"));
    }

    public void join(Peer peer, Admission admission, RoomLayout layout) {
        if (closed) { reject(peer, "ROOM_CLOSED", true); return; }
        pendingJoins.incrementAndGet();
        control(() -> {
            try {
            synchronized (this) {
            if (peer.isClosed()) return;
            if (closed) { reject(peer, "ROOM_CLOSED", true); return; }
            try {
                if (admission.leaseExpiresAt() <= clock.millis()) throw new RuleViolation("ACCESS_EXPIRED");
                Peer previous = peers.get(admission.memberId());
                if (previous != null && previous.order() > peer.order()) { peer.close(4002, "CONNECTION_REPLACED"); return; }
                if (state.replaceLayout(layout, clock.millis())) broadcast();
                state.join(admission, peer.generation(), clock.millis());
                peers.put(admission.memberId(), peer);
                results.put(admission.memberId(), new LinkedHashMap<>());
                peer.joined();
                hasJoined = true;
                if (previous != null && previous != peer) previous.close(4002, "CONNECTION_REPLACED");
                peer.send(state.snapshot("ROOM_SNAPSHOT", admission.memberId(), peer.generation(), clock.millis()), false, clock.millis());
                broadcast();
            } catch (RuleViolation error) { reject(peer, error.code(), true); }
            }
            } finally { pendingJoins.decrementAndGet(); }
        });
    }

    public void leave(Peer peer) {
        control(() -> {
            String memberId = peer.identity().memberId();
            if (closed || peers.get(memberId) != peer) return;
            if (state.leave(memberId, peer.generation(), clock.millis())) {
                peers.remove(memberId, peer);
                results.remove(memberId);
                pendingMoves.remove(peer.generation());
                broadcast();
            }
        });
    }

    public void message(Peer peer, Map<String, Object> message) {
        synchronized (peer) {
            if ("MOVE".equals(message.get("type"))) {
                AtomicReference<Map<String, Object>> pending = pendingMoves.get(peer.generation());
                if (pending != null) {
                    if (Values.number(message, "moveSeq") > Values.number(pending.get(), "moveSeq")) pending.set(message);
                    return;
                }
                AtomicReference<Map<String, Object>> delivery = new AtomicReference<>(message);
                pendingMoves.put(peer.generation(), delivery);
                if (!mailbox.submit(() -> {
                    Map<String, Object> latest;
                    synchronized (peer) {
                        pendingMoves.remove(peer.generation(), delivery);
                        latest = delivery.get();
                    }
                    process(peer, latest);
                }, false)) {
                    pendingMoves.remove(peer.generation(), delivery);
                    reject(peer, "OVERLOADED", true);
                }
            } else {
                pendingMoves.remove(peer.generation());
                if (!mailbox.submit(() -> process(peer, message), false)) reject(peer, "OVERLOADED", true);
            }
        }
    }

    private void process(Peer peer, Map<String, Object> message) {
        if (closed || peer.isClosed()) return;
        String memberId = peer.identity().memberId();
        String commandId = null;
        try {
            if (peers.get(memberId) != peer) throw new RuleViolation("CONNECTION_REPLACED");
            state.actor(memberId, peer.generation(), clock.millis());
            if (!state.epoch().equals(message.get("roomEpoch")) || !peer.generation().equals(message.get("connectionGeneration"))) {
                throw new RuleViolation("STALE_CONNECTION");
            }
            String type = Values.text(message, "type");
            if (type.equals("RESYNC")) {
                peer.send(state.snapshot("ROOM_SNAPSHOT", memberId, peer.generation(), clock.millis()), false, clock.millis());
                return;
            }
            if (type.equals("PING")) {
                peer.send(state.context("PONG", memberId, peer.generation(), clock.millis()), false, clock.millis());
                return;
            }
            if (type.equals("COMMAND")) {
                commandId = Values.text(message, "commandId");
                CachedResult previous = results.get(memberId).get(commandId);
                if (previous != null && previous.expiresAt() > clock.millis()) {
                    peer.send(previous.result(), false, clock.millis());
                    return;
                }
            }
            if (Values.number(message, "layoutRevision") != state.layoutRevision()) throw new RuleViolation("LAYOUT_MISMATCH");
            Map<String, Object> payload = Values.object(message.get("payload"));
            if (type.equals("MOVE")) {
                double seq = Values.number(message, "moveSeq");
                if (seq < 1 || seq != Math.floor(seq) || seq > 9007199254740991L) throw new RuleViolation("INVALID_MESSAGE");
                state.move(memberId, peer.generation(), (long) seq, payload, clock.millis());
            } else if (type.equals("COMMAND")) {
                state.command(memberId, peer.generation(), payload, clock.millis());
                result(peer, commandId, true, "OK");
                broadcast();
            } else throw new RuleViolation("INVALID_MESSAGE");
        } catch (RuleViolation error) {
            if (commandId != null) result(peer, commandId, false, error.code());
            else reject(peer, error.code(), false);
            if (error.code().equals("INVALID_MOVEMENT") || error.code().equals("LAYOUT_MISMATCH")) {
                peer.send(state.snapshot("ROOM_SNAPSHOT", memberId, peer.generation(), clock.millis()), false, clock.millis());
            }
            if (error.code().equals("ACCESS_EXPIRED")) peer.close(4001, error.code());
        }
    }

    private void result(Peer peer, String commandId, boolean success, String code) {
        Map<String, Object> result = state.context("COMMAND_RESULT", peer.identity().memberId(), peer.generation(), clock.millis());
        result.put("commandId", commandId);
        result.put("success", success);
        result.put("code", code);
        result.put("message", code);
        LinkedHashMap<String, CachedResult> cache = results.get(peer.identity().memberId());
        if (cache != null) {
            cache.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= clock.millis());
            if (cache.size() >= 128) cache.remove(cache.keySet().iterator().next());
            cache.put(commandId, new CachedResult(result, clock.millis() + 60000));
        }
        peer.send(result, false, clock.millis());
    }

    public void renew(Peer peer, Admission admission, RoomLayout layout) {
        control(() -> {
            if (closed || peer.isClosed() || peers.get(admission.memberId()) != peer) return;
            try {
                long now = clock.millis();
                boolean presentationChanged = state.renew(admission, peer.generation(), now);
                if (state.replaceLayout(layout, now) || presentationChanged) broadcast();
            } catch (RuleViolation error) { peer.close(4001, error.code()); }
        });
    }

    public void layout(RoomLayout layout) {
        control(() -> { if (!closed && state.replaceLayout(layout, clock.millis())) broadcast(); });
    }

    public void tick() {
        if (!ticking.compareAndSet(false, true)) return;
        if (!mailbox.submit(() -> {
            try {
                long now = clock.millis();
                boolean changed = state.tick(now);
                for (ParticipantState actor : state.participants()) {
                    Peer peer = peers.get(actor.memberId());
                    if (actor.leaseExpiresAt() <= now) peer.close(4001, "ACCESS_EXPIRED");
                    if (peer.isClosed() && now - peer.disconnectedAt() >= graceMs) {
                        changed |= state.leave(actor.memberId(), peer.generation(), now);
                        peers.remove(actor.memberId());
                        results.remove(actor.memberId());
                    }
                }
                if (changed) broadcast();
                if (lastFrame != state.frameSeq()) {
                    lastFrame = state.frameSeq();
                    for (Peer peer : peers.values()) peer.send(state.movement(peer.identity().memberId(), peer.generation(), now), true, now);
                }
                if (peers.isEmpty() && pendingJoins.get() == 0 && (hasJoined || now - createdAt >= 5000)) terminate("EMPTY");
            } finally { ticking.set(false); }
        }, true)) { ticking.set(false); terminate("OVERLOADED"); }
    }

    private void broadcast() {
        long now = clock.millis();
        for (Peer peer : peers.values()) peer.send(state.snapshot("ROOM_STATE", peer.identity().memberId(), peer.generation(), now), false, now);
    }

    private void control(Runnable action) {
        if (!mailbox.submit(action, true)) terminate("OVERLOADED");
    }

    public void terminate(String reason) {
        synchronized (this) {
            if (closed) return;
            closed = true;
            int code = reason.equals("SERVER_RESTART") || reason.equals("EMPTY") ? 1001 : reason.equals("ACCESS_DENIED") ? 4001 : 4004;
            for (Peer peer : peers.values()) peer.close(code, reason);
        }
        mailbox.close();
        pendingMoves.clear();
        remove.run();
    }

    private void reject(Peer peer, String code, boolean close) {
        peer.send(Map.of("type", "ERROR", "code", code, "message", code, "retryable", code.equals("OVERLOADED")), false, clock.millis());
        if (close) peer.close(code.equals("OVERLOADED") || code.equals("ROOM_CLOSED") ? 4004 : code.equals("LAYOUT_UPGRADE_REQUIRED") ? 4003 : 4001, code);
    }

    public boolean beginRefresh() { return !closed && refreshing.compareAndSet(false, true); }
    public void endRefresh() { refreshing.set(false); }
    public boolean isClosed() { return closed; }
    public boolean hasConnectedPlayers() { return !closed && peers.values().stream().anyMatch(peer -> peer.isJoined() && !peer.isClosed()); }
    public String roomId() { return state.roomId(); }
    public int queued() { return mailbox.queued(); }
}

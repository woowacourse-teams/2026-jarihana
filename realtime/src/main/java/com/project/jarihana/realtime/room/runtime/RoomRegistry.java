package com.project.jarihana.realtime.room.runtime;

import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.auth.AdmissionTokenVerifier;
import com.project.jarihana.realtime.auth.AdmissionTokenVerifier.Identity;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.layout.LayoutCatalog;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.persistence.RoomReadRepository;
import com.project.jarihana.realtime.transport.protocol.Values;
import com.project.jarihana.realtime.transport.websocket.Peer;
import com.project.jarihana.realtime.transport.websocket.RealtimeSocketMetrics;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.CloseStatus;
import tools.jackson.databind.ObjectMapper;

@Component
public final class RoomRegistry {
    private static final Logger log = LoggerFactory.getLogger(RoomRegistry.class);
    private final RealtimeProperties properties;
    private final AdmissionTokenVerifier tokens;
    private final RoomReadRepository roomReads;
    private final LayoutCatalog catalog;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final RealtimeSocketMetrics socketMetrics;
    private final Map<RealtimeEnvironment, Long> lastDatabaseWarning = new ConcurrentHashMap<>();
    private final Map<String, Peer> peers = new ConcurrentHashMap<>();
    private final Map<RoomKey, RoomRuntime> rooms = new ConcurrentHashMap<>();
    private final Map<TokenKey, Long> consumedTokens = new ConcurrentHashMap<>();
    private final ExecutorService roomWorkers;
    private final ExecutorService databaseWorkers;
    private final ExecutorService writers;
    private final ExecutorService closers;
    private final ScheduledExecutorService scheduler;
    private volatile boolean stopped;
    private long lastRefresh;
    private long lastLayout;

    public RoomRegistry(RealtimeProperties properties, AdmissionTokenVerifier tokens, RoomReadRepository roomReads,
            LayoutCatalog catalog, ObjectMapper mapper, Clock clock, MeterRegistry metrics) {
        this.properties = properties;
        this.tokens = tokens;
        this.roomReads = roomReads;
        this.catalog = catalog;
        this.mapper = mapper;
        this.clock = clock;
        socketMetrics = new RealtimeSocketMetrics(metrics);
        roomWorkers = pool("room-", Math.min(8, Math.max(2, Runtime.getRuntime().availableProcessors())), properties.maxRooms() * 2);
        databaseWorkers = pool("room-db-", 8, 128);
        writers = pool("socket-writer-", 16, properties.maxConnections());
        closers = pool("socket-close-", 8, properties.maxConnections());
        scheduler = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().name("room-tick-", 0).factory());
        metrics.gauge("realtime.connections", peers, Map::size);
        metrics.gauge("realtime.rooms", rooms, Map::size);
        metrics.gauge("realtime.outbound.bytes", peers, values -> values.values().stream().mapToLong(Peer::bufferedBytes).sum());
        metrics.gauge("realtime.room.queue", rooms, values -> values.values().stream().mapToInt(RoomRuntime::queued).sum());
        for (RealtimeEnvironment environment : RealtimeEnvironment.values()) {
            Tags tags = Tags.of("environment", environment.name().toLowerCase(Locale.ROOT));
            metrics.gauge("realtime.active.players", tags, peers, values -> values.values().stream()
                    .filter(peer -> peer.isJoined() && !peer.isClosed() && peer.identity().environment() == environment).count());
            metrics.gauge("realtime.active.rooms", tags, rooms, values -> values.entrySet().stream()
                    .filter(room -> room.getKey().environment() == environment && room.getValue().hasConnectedPlayers()).count());
        }
        scheduler.scheduleAtFixedRate(this::tickSafely, 50, 50, TimeUnit.MILLISECONDS);
    }

    private static ExecutorService pool(String name, int threads, int queued) {
        return new ThreadPoolExecutor(threads, threads, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(queued),
                Thread.ofPlatform().name(name, 0).factory(), new ThreadPoolExecutor.AbortPolicy());
    }

    public synchronized void open(WebSocketSession socket) {
        Peer peer = new Peer(socket, mapper, writers, closers, properties.outboundBytes(), clock.millis(), socketMetrics);
        if (stopped || !properties.enabled()) { peer.close(4001, "REALTIME_UNAVAILABLE"); return; }
        if (peers.size() >= properties.maxConnections()) { peer.close(4004, "OVERLOADED"); return; }
        peers.put(socket.getId(), peer);
    }

    public void message(String socketId, Map<String, Object> message) {
        Peer peer = peers.get(socketId);
        if (peer == null || peer.isClosed()) return;
        try {
            if (!peer.receive(clock.millis())) throw new RuleViolation("RATE_LIMITED");
            String type = Values.text(message, "type");
            if (type.equals("AUTH_JOIN")) {
                if (Values.number(message, "protocolVersion") != 1) throw new RuleViolation("PROTOCOL_MISMATCH");
                if (!peer.beginAuth()) throw new RuleViolation("ALREADY_AUTHENTICATED");
                Object raw = message.get("token");
                if (!(raw instanceof String token) || token.length() > 4096) throw new RuleViolation("INVALID_TOKEN");
                submit(() -> authenticate(peer, token), () -> reject(peer, "OVERLOADED"));
                return;
            }
            if (!peer.isJoined()) throw new RuleViolation("AUTH_REQUIRED");
            RoomRuntime room = rooms.get(roomKey(peer.identity()));
            if (room == null || room.isClosed()) throw new RuleViolation("ROOM_CLOSED");
            room.message(peer, message);
        } catch (RuleViolation error) { reject(peer, error.code()); }
    }

    public void malformed(String socketId) {
        Peer peer = peers.get(socketId);
        if (peer != null) reject(peer, "INVALID_MESSAGE");
    }

    public void disconnected(String socketId) {
        disconnected(socketId, CloseStatus.NO_CLOSE_FRAME);
    }

    public void disconnected(String socketId, CloseStatus status) {
        Peer peer = peers.remove(socketId);
        if (peer == null) return;
        peer.disconnected(clock.millis());
        if (status.getCode() == 1000 && "LEAVE".equals(status.getReason()) && peer.identity() != null) {
            RoomRuntime room = rooms.get(roomKey(peer.identity()));
            if (room != null) room.leave(peer);
        }
    }

    private void authenticate(Peer peer, String token) {
        try {
            var identity = tokens.verify(token);
            if (peer.isClosed() || stopped) return;
            peer.identify(identity);
            synchronized (consumedTokens) {
                if (consumedTokens.size() >= properties.maxConnections() * 4) throw new RuleViolation("OVERLOADED");
                TokenKey tokenKey = new TokenKey(identity.environment(), identity.tokenId());
                if (consumedTokens.putIfAbsent(tokenKey, identity.expiresAt()) != null) throw new RuleViolation("TOKEN_REPLAYED");
            }
            Admission admission = roomReads.admission(identity.environment(), identity.roomId(), identity.memberId());
            validate(admission, peer);
            RoomLayout layout = catalog.read(admission.layoutRevision(), admission.room());
            if (peer.isClosed() || stopped) return;
            acquire(roomKey(identity), layout).join(peer, admission, layout);
        } catch (RuleViolation error) { reject(peer, error.code()); }
        catch (RuntimeException error) {
            if (peer.identity() != null) warnOnDatabaseFailure(error, peer.identity().environment(), "admission");
            reject(peer, "BACKEND_UNAVAILABLE");
        }
    }

    private static void validate(Admission admission, Peer peer) {
        if (!peer.identity().memberId().equals(admission.memberId()) || !peer.identity().roomId().equals(admission.roomId()) ||
                admission.displayName() == null || admission.avatarColor() == null || admission.role() == null) {
            throw new RuleViolation("INVALID_ADMISSION");
        }
    }

    private static RoomKey roomKey(Identity identity) {
        return new RoomKey(identity.environment(), identity.roomId());
    }

    private synchronized RoomRuntime acquire(RoomKey key, RoomLayout layout) {
        RoomRuntime room = rooms.get(key);
        if (room != null && !room.isClosed()) return room;
        if (stopped || rooms.size() >= properties.maxRooms()) throw new RuleViolation("OVERLOADED");
        RoomRuntime created = new RoomRuntime(key.roomId(), layout, properties, roomWorkers, clock,
                () -> rooms.computeIfPresent(key, (id, current) -> current.isClosed() ? null : current));
        rooms.put(key, created);
        return created;
    }

    private void tickSafely() {
        try { tick(); }
        catch (RuntimeException error) { log.error("Realtime maintenance failed", error); }
    }

    private void tick() {
        if (stopped) return;
        long now = clock.millis();
        consumedTokens.entrySet().removeIf(entry -> entry.getValue() <= now);
        for (Peer peer : peers.values()) {
            if (peer.isClosed()) { peers.remove(peer.socketId(), peer); continue; }
            if (!peer.isJoined() && now - peer.openedAt() > properties.authenticationTimeoutMs()) peer.close(4005, "AUTH_TIMEOUT");
            else if (now - peer.lastSeen() > properties.heartbeatTimeoutMs()) peer.close(4004, "HEARTBEAT_TIMEOUT");
            else if (peer.stalled(now)) peer.close(4004, "SLOW_CONSUMER");
        }
        rooms.values().forEach(RoomRuntime::tick);
        if (now - lastRefresh >= properties.refreshIntervalMs()) {
            lastRefresh = now;
            for (Peer peer : peers.values()) if (peer.isJoined() && !peer.isClosed() && peer.beginRefresh()) {
                submit(() -> refresh(peer), peer::endRefresh);
            }
        }
        if (now - lastLayout >= Math.min(10000, properties.refreshIntervalMs())) {
            lastLayout = now;
            rooms.forEach((key, room) -> {
                if (room.beginRefresh()) submit(() -> refreshLayout(key, room), room::endRefresh);
            });
        }
    }

    private void refresh(Peer peer) {
        try {
            Identity identity = peer.identity();
            Admission admission = roomReads.admission(identity.environment(), identity.roomId(), identity.memberId());
            validate(admission, peer);
            RoomLayout layout = catalog.read(admission.layoutRevision(), admission.room());
            RoomRuntime room = rooms.get(roomKey(identity));
            if (room != null && !peer.isClosed()) room.renew(peer, admission, layout);
        } catch (RuleViolation error) { reject(peer, error.code()); }
        catch (RuntimeException error) { warnOnDatabaseFailure(error, peer.identity().environment(), "permission_refresh"); }
        finally { peer.endRefresh(); }
    }

    private void refreshLayout(RoomKey key, RoomRuntime room) {
        try {
            var stored = roomReads.layout(key.environment(), key.roomId());
            room.layout(catalog.read(stored.revision(), stored.room()));
        } catch (RuleViolation error) { room.terminate(error.code()); }
        catch (RuntimeException error) { warnOnDatabaseFailure(error, key.environment(), "layout_refresh"); }
        finally { room.endRefresh(); }
    }

    private void submit(Runnable work, Runnable rejected) {
        try { databaseWorkers.execute(work); }
        catch (RejectedExecutionException error) { rejected.run(); }
    }

    private void warnOnDatabaseFailure(RuntimeException error, RealtimeEnvironment environment, String operation) {
        if (!(error instanceof DataAccessException)) return;
        long now = clock.millis();
        lastDatabaseWarning.compute(environment, (key, previous) -> {
            if (previous != null && now - previous < 60_000) return previous;
            log.warn("Realtime database read failed environment={} operation={}", environment, operation);
            return now;
        });
    }

    private void reject(Peer peer, String code) {
        boolean retryable = code.equals("OVERLOADED") || code.equals("BACKEND_UNAVAILABLE") || code.equals("ROOM_CLOSED");
        peer.send(Map.of("type", "ERROR", "code", code, "message", code, "retryable", retryable), false, clock.millis());
        int closeCode = retryable ? 4004 : code.equals("PROTOCOL_MISMATCH") || code.equals("LAYOUT_UPGRADE_REQUIRED") ? 4003 : 4001;
        peer.close(closeCode, code);
    }

    @PreDestroy
    public void shutdown() {
        stopped = true;
        log.info("Stopping realtime service connections={} rooms={}", peers.size(), rooms.size());
        scheduler.shutdownNow();
        rooms.values().forEach(room -> room.terminate("SERVER_RESTART"));
        peers.values().forEach(peer -> peer.close(1001, "SERVER_RESTART"));
        databaseWorkers.shutdownNow();
        roomWorkers.shutdownNow();
        writers.shutdownNow();
        closers.shutdown();
    }

    private record RoomKey(RealtimeEnvironment environment, String roomId) {}
    private record TokenKey(RealtimeEnvironment environment, String tokenId) {}
}

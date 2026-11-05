package com.project.jarihana.gomoku.stream;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.gomoku.command.service.GomokuObservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.project.jarihana.gomoku.query.controller.dto.GomokuRoomResponse;
import com.project.jarihana.gomoku.query.service.GomokuQueryService;
import com.project.jarihana.gomoku.query.service.GomokuChatQueryService;
import com.project.jarihana.gomoku.query.service.dto.GomokuChatSignalResult;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

import jakarta.annotation.PreDestroy;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class GomokuStreams implements AutoCloseable, SmartLifecycle {
    private static final Logger log = LoggerFactory.getLogger(GomokuStreams.class);
    private final GomokuObservationService observations;
    private long lastCleanup;
    private final GomokuQueryService queries;
    private final GomokuChatQueryService chatQueries;
    private final Clock clock;
    private volatile boolean running;
    private final ConcurrentHashMap<Long, RoomClients> rooms = new ConcurrentHashMap<>();
    private final Set<Client> clients = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService ticker =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().daemon().name("gomoku-stream").factory());
    private final Semaphore snapshotQueries = new Semaphore(4);
    private final ExecutorService deliveries = Executors.newVirtualThreadPerTaskExecutor();

    public GomokuStreams(GomokuQueryService queries, GomokuChatQueryService chatQueries, GomokuObservationService observations, Clock clock) {
        this.queries = queries;
        this.chatQueries = chatQueries;
        this.clock = clock;
        this.observations = observations;
        this.lastCleanup = clock.millis();
        ticker.scheduleWithFixedDelay(this::tick, 500, 500, TimeUnit.MILLISECONDS);
    }

    public SseEmitter subscribe(long roomId, long memberId, long expiresAt) {
        return subscribe(roomId, memberId, expiresAt, null);
    }

    public synchronized SseEmitter subscribe(long roomId, long memberId, long expiresAt, UUID observationId) {
        if (!running)
            throw new BusinessException(ErrorCode.GOMOKU_STREAM_BUSY, "실시간 연결을 다시 시도해 주세요.");
        GomokuRoomResult initial = queries.getRoom(roomId, memberId, observationId);
        if (clients.size() >= 500
                || clients.stream().filter(client -> client.memberId == memberId).count() >= 6) {
            throw new BusinessException(
                    ErrorCode.GOMOKU_STREAM_BUSY, "실시간 연결이 많아요. 잠시 후 다시 연결해 주세요.");
        }
        long lifetime = Math.min(120_000L, expiresAt - clock.millis());
        if (lifetime <= 0) throw new BusinessException(ErrorCode.UNAUTHENTICATED, "다시 로그인해 주세요.");
        List<GomokuChatSignalResult> signals = chatQueries.signals(roomId);
        UUID participation = observationId != null ? observationId : signals.stream().filter(signal -> signal.memberId() == memberId)
                .map(GomokuChatSignalResult::participationId).findFirst().orElse(null);
        UUID connectionId = observationId == null ? null : observations.connect(roomId, memberId, observationId);
        Client client = new Client(roomId, memberId, expiresAt, participation, connectionId, new SseEmitter(lifetime));
        clients.add(client);
        rooms.compute(
                roomId,
                (id, previous) -> {
                    RoomClients room = previous == null ? new RoomClients() : previous;
                    room.remember(initial);
                    room.clients.add(client);
                    return room;
                });
        client.emitter.onCompletion(client::remove);
        client.emitter.onTimeout(client::close);
        client.emitter.onError(error -> client.remove());
        client.offer(initial, signals, observationId == null ? Set.of() : Set.of(observationId));
        return client.emitter;
    }

    private void tick() {
        if (!running) return;
        if (clock.millis() - lastCleanup >= 15_000L) {
            lastCleanup = clock.millis();
            deliveries.submit(() -> {
                try {
                    observations.removeExpiredConnections();
                } catch (RuntimeException exception) {
                    log.warn("Gomoku observer lease cleanup deferred after a database failure");
                }
            });
        }
        if (rooms.isEmpty()) return;
        Map<Long, RoomClients> pollingRooms = Map.copyOf(rooms);
        Map<Long, Long> revisions;
        try {
            revisions = queries.findRevisions(pollingRooms.keySet());
        } catch (RuntimeException exception) {
            clients.forEach(Client::close);
            return;
        }
        pollingRooms.forEach((id, room) -> {
            Long revision = revisions.get(id);
            if (revision == null) {
                room.clients.forEach(Client::close);
                return;
            }
            if (!snapshotQueries.tryAcquire()) return;
            if (!room.polling.compareAndSet(false, true)) {
                snapshotQueries.release();
                return;
            }
            try {
                deliveries.submit(() -> {
                    try {
                        GomokuRoomResult cached = room.snapshot.get();
                        GomokuRoomResult snapshot = revision > cached.revision()
                                ? room.remember(queries.loadSnapshot(id)) : cached;
                        List<GomokuChatSignalResult> signals;
                        try {
                            signals = chatQueries.signals(id);
                        } catch (RuntimeException exception) {
                            signals = null;
                        }
                        Set<UUID> candidates = room.clients.stream().filter(client -> client.connectionId != null)
                                .map(client -> client.participationId).collect(Collectors.toSet());
                        Set<UUID> activeObservations = queries.activeObservations(id, candidates);
                        for (Client client : room.clients) client.offer(snapshot, signals, activeObservations);
                    } catch (RuntimeException exception) {
                        room.clients.forEach(Client::close);
                    } finally {
                        room.polling.set(false);
                        snapshotQueries.release();
                    }
                });
            } catch (RejectedExecutionException exception) {
                room.polling.set(false);
                snapshotQueries.release();
            }
        });
    }

    @Override
    @PreDestroy
    public void close() {
        stop();
        ticker.shutdownNow();
        deliveries.shutdownNow();
    }

    @Override
    public void start() {
        running = true;
    }

    @Override
    public void stop() {
        running = false;
        clients.forEach(Client::close);
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        return Integer.MAX_VALUE;
    }

    private static final class RoomClients {
        private final Set<Client> clients = ConcurrentHashMap.newKeySet();
        private final AtomicBoolean polling = new AtomicBoolean();
        private final AtomicReference<GomokuRoomResult> snapshot = new AtomicReference<>();

        private GomokuRoomResult remember(GomokuRoomResult next) {
            return snapshot.accumulateAndGet(
                    next,
                    (previous, current) ->
                            previous == null
                                            || current.revision() > previous.revision()
                                            || (current.revision() == previous.revision()
                                                    && current.serverNow() > previous.serverNow())
                                    ? current
                                    : previous);
        }
    }

    private final class Client {
        private final long roomId;
        private final long memberId;
        private final long expiresAt;
        private final UUID participationId;
        private final UUID connectionId;
        private final AtomicBoolean leaseRemoved = new AtomicBoolean();
        private long lastRenewedAt;
        private final SseEmitter emitter;
        private final AtomicBoolean writing = new AtomicBoolean();
        private final AtomicBoolean closed = new AtomicBoolean();
        private long sent = -1;
        private long chatSent = -1;
        private long lastSentAt;

        private Client(long roomId, long memberId, long expiresAt, UUID participationId, UUID connectionId, SseEmitter emitter) {
            this.roomId = roomId;
            this.memberId = memberId;
            this.expiresAt = expiresAt;
            this.participationId = participationId;
            this.connectionId = connectionId;
            this.lastRenewedAt = clock.millis();
            this.emitter = emitter;
        }

        private void offer(GomokuRoomResult snapshot, List<GomokuChatSignalResult> signals, Set<UUID> activeObservations) {
            if (!running || closed.get() || !writing.compareAndSet(false, true)) return;
            deliveries.submit(
                    () -> {
                        try {
                            boolean permitted = connectionId == null ? snapshot.contains(memberId)
                                    : snapshot.visibility() == RoomVisibility.PUBLIC && activeObservations.contains(participationId);
                            if (clock.millis() >= expiresAt || !permitted) {
                                close();
                                return;
                            }
                            GomokuChatSignalResult chat = signals == null ? null : signals.stream()
                                    .filter(signal -> signal.memberId() == memberId
                                            && (participationId == null || participationId.equals(signal.participationId())))
                                    .findFirst().orElse(null);
                            if (connectionId == null && snapshot.status() != RoomStatus.CLOSED && signals != null && participationId != null
                                    && (chat == null || !participationId.equals(chat.participationId()))) {
                                close();
                                return;
                            }
                            if (connectionId != null && clock.millis() - lastRenewedAt >= 15_000L) {
                                observations.renew(connectionId);
                                lastRenewedAt = clock.millis();
                            }
                            if (snapshot.revision() > sent) {
                                emitter.send(
                                        SseEmitter.event()
                                                .name("snapshot")
                                                .id(Long.toString(snapshot.revision()))
                                                .reconnectTime(2000)
                                                .data(GomokuRoomResponse.from(snapshot)));
                                sent = snapshot.revision();
                                lastSentAt = clock.millis();
                            } else if (clock.millis() - lastSentAt >= 15_000L) {
                                emitter.send(SseEmitter.event().comment("keepalive"));
                                lastSentAt = clock.millis();
                            }
                            if (snapshot.status() == RoomStatus.CLOSED) close();
                            else if (chat != null && chat.latestSequence() > chatSent) {
                                emitter.send(SseEmitter.event().name("chat_changed").data(GomokuChatChanged.from(chat)));
                                chatSent = chat.latestSequence();
                                lastSentAt = clock.millis();
                            }
                        } catch (IOException exception) {
                            remove();
                        } catch (RuntimeException exception) {
                            close();
                        } finally {
                            writing.set(false);
                        }
                    });
        }

        private void remove() {
            closed.set(true);
            clients.remove(this);
            if (connectionId != null && leaseRemoved.compareAndSet(false, true)) {
                try {
                    observations.disconnect(connectionId);
                } catch (RuntimeException exception) {
                    log.warn("Gomoku observer disconnect cleanup deferred to lease expiration");
                }
            }
            rooms.computeIfPresent(
                    roomId,
                    (id, room) -> {
                        room.clients.remove(this);
                        return room.clients.isEmpty() ? null : room;
                    });
        }

        private void close() {
            if (closed.compareAndSet(false, true)) {
                remove();
                try {
                    emitter.complete();
                } catch (IllegalStateException exception) {
                    // The servlet may have completed concurrently with shutdown or a disconnect.
                }
            }
        }
    }
}

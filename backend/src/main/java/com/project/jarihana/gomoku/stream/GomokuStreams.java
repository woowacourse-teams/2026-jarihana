package com.project.jarihana.gomoku.stream;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.query.controller.dto.GomokuRoomResponse;
import com.project.jarihana.gomoku.query.service.GomokuQueryService;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

import jakarta.annotation.PreDestroy;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
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
    private final GomokuQueryService queries;
    private final Clock clock;
    private volatile boolean running;
    private final ConcurrentHashMap<Long, RoomClients> rooms = new ConcurrentHashMap<>();
    private final Set<Client> clients = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService ticker =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().daemon().name("gomoku-stream").factory());
    private final Semaphore snapshotQueries = new Semaphore(4);
    private final ExecutorService deliveries = Executors.newVirtualThreadPerTaskExecutor();

    public GomokuStreams(GomokuQueryService queries, Clock clock) {
        this.queries = queries;
        this.clock = clock;
        ticker.scheduleWithFixedDelay(this::tick, 500, 500, TimeUnit.MILLISECONDS);
    }

    public synchronized SseEmitter subscribe(long roomId, long memberId, long expiresAt) {
        if (!running)
            throw new BusinessException(ErrorCode.GOMOKU_STREAM_BUSY, "실시간 연결을 다시 시도해 주세요.");
        GomokuRoomResult initial = queries.getRoom(roomId, memberId);
        if (clients.size() >= 500
                || clients.stream().filter(client -> client.memberId == memberId).count() >= 6) {
            throw new BusinessException(
                    ErrorCode.GOMOKU_STREAM_BUSY, "실시간 연결이 많아요. 잠시 후 다시 연결해 주세요.");
        }
        long lifetime = Math.min(120_000L, expiresAt - clock.millis());
        if (lifetime <= 0) throw new BusinessException(ErrorCode.UNAUTHENTICATED, "다시 로그인해 주세요.");
        Client client = new Client(roomId, memberId, expiresAt, new SseEmitter(lifetime));
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
        client.offer(initial);
        return client.emitter;
    }

    private void tick() {
        if (!running || rooms.isEmpty()) return;
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
            GomokuRoomResult cached = room.snapshot.get();
            for (Client client : room.clients) client.offer(cached);
            if (revision <= cached.revision() || !snapshotQueries.tryAcquire()) return;
            if (!room.polling.compareAndSet(false, true)) {
                snapshotQueries.release();
                return;
            }
            try {
                deliveries.submit(() -> {
                    try {
                        GomokuRoomResult snapshot = room.remember(queries.loadSnapshot(id));
                        for (Client client : room.clients) client.offer(snapshot);
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
        private final SseEmitter emitter;
        private final AtomicBoolean writing = new AtomicBoolean();
        private final AtomicBoolean closed = new AtomicBoolean();
        private long sent = -1;
        private long lastSentAt;

        private Client(long roomId, long memberId, long expiresAt, SseEmitter emitter) {
            this.roomId = roomId;
            this.memberId = memberId;
            this.expiresAt = expiresAt;
            this.emitter = emitter;
        }

        private void offer(GomokuRoomResult snapshot) {
            if (!running || closed.get() || !writing.compareAndSet(false, true)) return;
            deliveries.submit(
                    () -> {
                        try {
                            if (clock.millis() >= expiresAt || !snapshot.contains(memberId)) {
                                close();
                                return;
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
                        } catch (IOException exception) {
                            remove();
                        } catch (IllegalStateException exception) {
                            remove();
                        } finally {
                            writing.set(false);
                        }
                    });
        }

        private void remove() {
            closed.set(true);
            clients.remove(this);
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

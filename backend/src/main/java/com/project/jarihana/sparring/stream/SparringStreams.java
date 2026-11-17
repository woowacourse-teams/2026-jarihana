package com.project.jarihana.sparring.stream;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;
import com.project.jarihana.sparring.query.service.SparringStreamQueryService;
import com.project.jarihana.sparring.query.service.dto.SparringPostResult;
import com.project.jarihana.sparring.stream.dto.SparringStreamResponse;

import io.micrometer.core.instrument.binder.MeterBinder;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/**
 * Notifications trigger reads for active topics. Periodic revision reconciliation recovers missed
 * notifications, including writes from an older application instance during deployment.
 */
@Component
public class SparringStreams {
    private static final Logger log = LoggerFactory.getLogger(SparringStreams.class);

    private final SparringQueryRepository repository;
    private final SparringStreamQueryService queries;
    private final ConcurrentHashMap<Long, Room> rooms = new ConcurrentHashMap<>();
    private final ScheduledExecutorService ticker =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().daemon().name("sparring-tick").factory());
    private final ScheduledExecutorService reconciliation;
    private final ExecutorService deliveries = Executors.newVirtualThreadPerTaskExecutor();
    private final Set<Client> clients = ConcurrentHashMap.newKeySet();

    public SparringStreams(
            SparringQueryRepository repository, SparringStreamQueryService queries) {
        this.repository = repository;
        this.queries = queries;
        reconciliation = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon().name("sparring-reconcile").factory());
        reconciliation.scheduleWithFixedDelay(this::reconcileRevisions, 5, 5, TimeUnit.SECONDS);
        // Initialize new subscriptions and send keepalives without querying unchanged rooms.
        ticker.scheduleWithFixedDelay(this::tick, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized SseEmitter subscribe(long topicId) {
        repository
                .revision(topicId)
                .orElseThrow(
                        () ->
                                new BusinessException(
                                        ErrorCode.SPARRING_NOT_FOUND, "스파링을 찾을 수 없어요."));
        SseEmitter emitter = new SseEmitter(120_000L);
        Client client = new Client(topicId, emitter);
        clients.add(client);
        rooms.compute(
                topicId,
                (id, previous) -> {
                    Room room = previous == null ? new Room() : previous;
                    room.clients.add(client);
                    room.dirty.set(true);
                    return room;
                });
        emitter.onCompletion(client::remove);
        emitter.onTimeout(client::close);
        emitter.onError(error -> client.remove());
        return emitter;
    }

    @Bean
    MeterBinder sparringStreamMetrics() {
        return registry -> registry.gauge("sparring.active.rooms", rooms,
                map -> map.size());
    }

    void markChanged(long topicId) {
        Room room = rooms.get(topicId);
        if (room == null) return;
        room.dirty.set(true);
        schedulePoll(topicId, room);
    }

    void markAllChanged() {
        rooms.keySet().forEach(this::markChanged);
    }

    private void reconcileRevisions() {
        Map<Long, Room> activeRooms = Map.copyOf(rooms);
        if (activeRooms.isEmpty()) return;

        try {
            var revisions = repository.revisions(List.copyOf(activeRooms.keySet()));
            for (var row : revisions) {
                Room room = activeRooms.get(row.getId());
                if (row.getRevision() > room.revision) markChanged(row.getId());
            }
        } catch (RuntimeException exception) {
            log.warn("Sparring revision reconciliation failed", exception);
        }
    }

    private void tick() {
        rooms.forEach(this::schedulePoll);
    }

    private void schedulePoll(long id, Room room) {
        if (deliveries.isShutdown() || !room.polling.compareAndSet(false, true)) return;
        deliveries.submit(
                () -> {
                    try {
                        boolean queryRequired = room.dirty.getAndSet(false);
                        List<Client> subscribers = List.copyOf(room.clients);
                        if (!queryRequired) {
                            for (Client client : subscribers) client.heartbeat();
                            return;
                        }
                        boolean snapshotRequired =
                                subscribers.stream()
                                        .anyMatch(client -> !client.initialized);
                        var result =
                                queries.poll(
                                        id,
                                        room.revision,
                                        room.lastPostId,
                                        snapshotRequired);
                        if (result == null) {
                            for (Client client : subscribers) client.heartbeat();
                            return;
                        }
                        boolean changed = result.revision() != room.revision;
                        SparringStreamResponse snapshot =
                                snapshotRequired
                                        ? SparringStreamResponse.from(result, true)
                                        : null;
                        SparringStreamResponse update =
                                changed
                                        ? SparringStreamResponse.from(result, false)
                                        : null;
                        for (Client client : subscribers) {
                            if (!client.initialized) {
                                client.offer("snapshot", snapshot);
                                client.initialized = true;
                            } else if (changed) client.offer("update", update);
                            else client.heartbeat();
                        }
                        room.lastPostId =
                                Math.max(
                                        room.lastPostId,
                                        Stream.concat(
                                                        result.latestPosts().stream(),
                                                        result.addedPosts().stream())
                                                .mapToLong(SparringPostResult::id)
                                                .max()
                                                .orElse(0));
                        room.revision = result.revision();
                    } catch (RuntimeException exception) {
                        // A transient database outage must not kill the scheduler or
                        // invent a new revision.
                        for (Client client : room.clients) client.close();
                    } finally {
                        room.polling.set(false);
                        if (room.dirty.get() && rooms.get(id) == room) {
                            schedulePoll(id, room);
                        }
                    }
                });
    }

    @PreDestroy
    void close() {
        ticker.shutdownNow();
        reconciliation.shutdownNow();
        clients.forEach(Client::close);
        deliveries.shutdownNow();
    }

    private static final class Room {
        private final Set<Client> clients = ConcurrentHashMap.newKeySet();
        private final AtomicBoolean polling = new AtomicBoolean();
        private final AtomicBoolean dirty = new AtomicBoolean();
        private volatile long revision = -1;
        private long lastPostId;
    }

    private final class Client {
        private final long topicId;
        private final SseEmitter emitter;
        private final AtomicBoolean writing = new AtomicBoolean();
        private final Queue<SseEmitter.SseEventBuilder> pending = new ConcurrentLinkedQueue<>();
        private volatile boolean removed;
        private boolean initialized;
        private int quietTicks;

        private Client(long topicId, SseEmitter emitter) {
            this.topicId = topicId;
            this.emitter = emitter;
        }

        private void offer(String name, SparringStreamResponse response) {
            if (removed) return;
            pending.add(
                    SseEmitter.event()
                            .name(name)
                            .id(Long.toString(response.revision()))
                            .reconnectTime(2000)
                            .data(response));
            // Keep already-open older clients working during the frontend/backend rollout.
            pending.add(
                    SseEmitter.event()
                            .name("revision")
                            .id(Long.toString(response.revision()))
                            .reconnectTime(2000)
                            .data(new Revision(response.revision())));
            quietTicks = 0;
            drain();
        }

        private void heartbeat() {
            if (removed || ++quietTicks < 15) return;
            quietTicks = 0;
            pending.add(SseEmitter.event().comment("keepalive"));
            drain();
        }

        private void drain() {
            if (removed || !writing.compareAndSet(false, true)) return;
            deliveries.submit(
                    () -> {
                        try {
                            SseEmitter.SseEventBuilder event;
                            while (!removed && (event = pending.poll()) != null)
                                emitter.send(event);
                        } catch (IOException | IllegalStateException exception) {
                            remove();
                        } finally {
                            writing.set(false);
                            if (!pending.isEmpty() && !removed) drain();
                        }
                    });
        }

        private void remove() {
            removed = true;
            pending.clear();
            clients.remove(this);
            rooms.computeIfPresent(
                    topicId,
                    (id, room) -> {
                        room.clients.remove(this);
                        return room.clients.isEmpty() ? null : room;
                    });
        }

        private void close() {
            remove();
            emitter.complete();
        }
    }

    public record Revision(long revision) {}
}

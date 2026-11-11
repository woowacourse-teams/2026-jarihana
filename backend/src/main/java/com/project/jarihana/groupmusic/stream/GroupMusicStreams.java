package com.project.jarihana.groupmusic.stream;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupmusic.stream.dto.GroupMusicRevisionResponse;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Revision-only invalidations; clients retrieve music through the existing read endpoint. */
@Component
public class GroupMusicStreams {
    private final GroupMusicStreamRepository repository;
    private final ConcurrentHashMap<Long, Room> rooms = new ConcurrentHashMap<>();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("group-music-recovery").factory());
    private final ExecutorService deliveries = Executors.newVirtualThreadPerTaskExecutor();

    public GroupMusicStreams(GroupMusicStreamRepository repository) {
        this.repository = repository;
        // One recovery read per subscribed group also observes commits from another server.
        ticker.scheduleWithFixedDelay(() -> rooms.forEach(this::refresh), 5, 5, TimeUnit.SECONDS);
    }

    public SseEmitter subscribe(long groupId) {
        GroupMusicChanged initial = repository.findRevision(groupId).orElseThrow(() ->
                new BusinessException(ErrorCode.GROUP_NOT_FOUND, "모임을 찾을 수 없습니다."));
        Client client = new Client(groupId, new SseEmitter(120_000L));
        client.emitter.onCompletion(client::remove);
        client.emitter.onTimeout(client::close);
        client.emitter.onError(error -> client.remove());
        Room room = rooms.compute(groupId, (id, existing) -> {
            Room current = existing == null ? new Room() : existing;
            current.clients.add(client);
            return current;
        });
        client.offer(initial);
        // Covers a commit between the initial read and adding the subscriber.
        refresh(groupId, room);
        return client.emitter;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void changed(GroupMusicChanged change) {
        Room room = rooms.get(change.groupId());
        if (room != null) room.clients.forEach(client -> client.offer(change));
    }

    private void refresh(long groupId, Room room) {
        if (!room.checking.compareAndSet(false, true)) return;
        try {
            deliveries.submit(() -> {
                try {
                    var revision = repository.findRevision(groupId);
                    if (revision.isEmpty()) room.clients.forEach(Client::close);
                    else room.clients.forEach(client -> {
                        client.offer(revision.get());
                        client.heartbeat();
                    });
                } catch (RuntimeException failure) {
                    room.clients.forEach(Client::close);
                } finally {
                    room.checking.set(false);
                }
            });
        } catch (RejectedExecutionException shutdown) {
            room.checking.set(false);
        }
    }

    @PreDestroy
    void close() {
        ticker.shutdownNow();
        rooms.values().forEach(room -> room.clients.forEach(Client::close));
        deliveries.shutdownNow();
    }

    private static final class Room {
        private final Set<Client> clients = ConcurrentHashMap.newKeySet();
        private final AtomicBoolean checking = new AtomicBoolean();
    }

    private final class Client {
        private final long groupId;
        private final SseEmitter emitter;
        private final AtomicReference<GroupMusicChanged> pending = new AtomicReference<>();
        private final AtomicBoolean writing = new AtomicBoolean();
        private final AtomicBoolean heartbeat = new AtomicBoolean();
        private final AtomicBoolean removed = new AtomicBoolean();
        private GroupMusicChanged latest;

        private Client(long groupId, SseEmitter emitter) {
            this.groupId = groupId;
            this.emitter = emitter;
        }

        private synchronized void offer(GroupMusicChanged next) {
            if (removed.get()) return;
            if (latest != null && (next.revision() < latest.revision()
                    || next.playbackRevision() < latest.playbackRevision()
                    || next.revision() == latest.revision() && next.playbackRevision() == latest.playbackRevision())) return;
            latest = next;
            pending.set(next);
            deliver();
        }

        private void heartbeat() {
            if (removed.get()) return;
            heartbeat.set(true);
            deliver();
        }

        private void deliver() {
            if (!writing.compareAndSet(false, true)) return;
            try {
                deliveries.submit(() -> {
                    try {
                        while (!removed.get()) {
                            GroupMusicChanged change = pending.getAndSet(null);
                            if (change != null) {
                                emitter.send(SseEmitter.event().name("change")
                                        .id(change.revision() + ":" + change.playbackRevision()).reconnectTime(2000)
                                        .data(new GroupMusicRevisionResponse(change.revision(), change.playbackRevision())));
                            } else if (heartbeat.getAndSet(false)) {
                                emitter.send(SseEmitter.event().comment("keepalive"));
                            } else break;
                        }
                    } catch (IOException | IllegalStateException failure) {
                        close();
                    } finally {
                        writing.set(false);
                        if (!removed.get() && (pending.get() != null || heartbeat.get())) deliver();
                    }
                });
            } catch (RejectedExecutionException shutdown) {
                writing.set(false);
                remove();
            }
        }

        private void remove() {
            if (!removed.compareAndSet(false, true)) return;
            pending.set(null);
            rooms.computeIfPresent(groupId, (id, room) -> {
                room.clients.remove(this);
                return room.clients.isEmpty() ? null : room;
            });
        }

        private void close() {
            remove();
            emitter.complete();
        }
    }
}

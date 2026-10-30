package com.project.jarihana.sparring.stream;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.sparring.query.repository.SparringQueryRepository;

import jakarta.annotation.PreDestroy;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * DB revision polling is shared per active topic, so commits on another application instance are
 * visible.
 */
@Component
public class SparringStreams {
    private final SparringQueryRepository repository;
    private final ConcurrentHashMap<Long, Room> rooms = new ConcurrentHashMap<>();
    private final ScheduledExecutorService ticker =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofPlatform().daemon().name("sparring-tick").factory());
    private final ExecutorService deliveries = Executors.newVirtualThreadPerTaskExecutor();
    private final Set<Client> clients = ConcurrentHashMap.newKeySet();

    public SparringStreams(SparringQueryRepository repository) {
        this.repository = repository;
        ticker.scheduleWithFixedDelay(this::tick, 1, 1, TimeUnit.SECONDS);
    }

    public synchronized SseEmitter subscribe(long topicId) {
        if (clients.size() >= 500) {
            throw new BusinessException(
                    ErrorCode.SPARRING_STREAM_BUSY, "실시간 연결이 많아요. 잠시 후 다시 연결할게요.");
        }
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
                    return room;
                });
        Runnable remove =
                () -> {
                    clients.remove(client);
                    rooms.computeIfPresent(
                            topicId,
                            (id, room) -> {
                                room.clients.remove(client);
                                return room.clients.isEmpty() ? null : room;
                            });
                };
        emitter.onCompletion(remove);
        emitter.onTimeout(
                () -> {
                    remove.run();
                    emitter.complete();
                });
        emitter.onError(error -> remove.run());
        return emitter;
    }

    private void tick() {
        rooms.forEach(
                (id, room) -> {
                    if (!room.polling.compareAndSet(false, true)) return;
                    deliveries.submit(
                            () -> {
                                try {
                                    long revision = repository.revision(id).orElse(-1L);
                                    for (Client client : room.clients) client.offer(revision);
                                } catch (RuntimeException exception) {
                                    // A transient database outage must not kill the scheduler or
                                    // invent a new revision.
                                    for (Client client : room.clients) client.close();
                                } finally {
                                    room.polling.set(false);
                                }
                            });
                });
    }

    @PreDestroy
    void close() {
        ticker.shutdownNow();
        clients.forEach(Client::close);
        deliveries.shutdownNow();
    }

    private static final class Room {
        private final Set<Client> clients = ConcurrentHashMap.newKeySet();
        private final AtomicBoolean polling = new AtomicBoolean();
    }

    private final class Client {
        private final long topicId;
        private final SseEmitter emitter;
        private final AtomicBoolean writing = new AtomicBoolean();
        private long sent = -1;
        private int quietTicks;

        private Client(long topicId, SseEmitter emitter) {
            this.topicId = topicId;
            this.emitter = emitter;
        }

        private void offer(long revision) {
            if (!writing.compareAndSet(false, true)) return;
            deliveries.submit(
                    () -> {
                        try {
                            if (revision < 0) {
                                close();
                                return;
                            }
                            if (revision != sent) {
                                emitter.send(
                                        SseEmitter.event()
                                                .name("revision")
                                                .id(Long.toString(revision))
                                                .reconnectTime(2000)
                                                .data(new Revision(revision)));
                                sent = revision;
                                quietTicks = 0;
                            } else if (++quietTicks >= 15) {
                                emitter.send(SseEmitter.event().comment("keepalive"));
                                quietTicks = 0;
                            }
                        } catch (IOException exception) {
                            remove();
                            // Spring owns servlet completion after an IOException.
                        } catch (IllegalStateException exception) {
                            remove();
                        } finally {
                            writing.set(false);
                        }
                    });
        }

        private void remove() {
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

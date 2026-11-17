package com.project.jarihana.rhythmbattle.stream;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.query.controller.dto.RhythmBattleRoomResponse;
import com.project.jarihana.rhythmbattle.query.service.RhythmBattleQueryService;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleBatchResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleChatResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRevisionResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRoomResult;

import jakarta.annotation.PreDestroy;

import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
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

/**
 * 대전 방의 실시간 연결이다. 오목처럼 구독 중인 방들의 revision을 한 번의 묶음 쿼리로 확인하고, 바뀐 방만 다시 읽는다.
 *
 * <p>대전은 상대 판을 다시 그려야 하므로 250ms마다 확인하고, 방 모습(snapshot)과 함께 지금 판의 입력 묶음(batches)과
 * 채팅(chat)을 보낸다. 같은 방의 연결은 다시 읽은 결과를 함께 쓴다.
 */
@Component
public class RhythmBattleStreams implements AutoCloseable, SmartLifecycle {
    private static final long TICK_MILLIS = 250;
    private static final int MAX_CLIENTS = 500;
    private static final int MAX_CLIENTS_PER_MEMBER = 6;
    private static final int CHAT_CACHE = 200;

    private final RhythmBattleQueryService queries;
    private final Clock clock;
    private volatile boolean running;
    private final ConcurrentHashMap<Long, RoomClients> rooms = new ConcurrentHashMap<>();
    private final Set<Client> clients = ConcurrentHashMap.newKeySet();
    private final ScheduledExecutorService ticker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon().name("rhythm-battle-stream").factory());
    private final Semaphore detailQueries = new Semaphore(10);
    private final ExecutorService deliveries = Executors.newVirtualThreadPerTaskExecutor();

    public RhythmBattleStreams(RhythmBattleQueryService queries, Clock clock) {
        this.queries = queries;
        this.clock = clock;
        ticker.scheduleWithFixedDelay(this::tick, TICK_MILLIS, TICK_MILLIS, TimeUnit.MILLISECONDS);
    }

    public synchronized SseEmitter subscribe(long roomId, long memberId, long expiresAt) {
        if (!running) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_STREAM_BUSY, "실시간 연결을 다시 시도해 주세요.");
        }
        RhythmBattleRoomResult initial = queries.getRoom(roomId, memberId);
        if (clients.size() >= MAX_CLIENTS
                || clients.stream().filter(client -> client.memberId == memberId).count() >= MAX_CLIENTS_PER_MEMBER) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_STREAM_BUSY, "실시간 연결이 많아요. 잠시 후 다시 연결해 주세요.");
        }
        long lifetime = Math.min(120_000L, expiresAt - clock.millis());
        if (lifetime <= 0) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED, "다시 로그인해 주세요.");
        }
        // 자리가 없으면(나갔거나 방이 닫혔으면) 채팅은 보내지 않는다.
        long chatAfter = queries.findChatAfterId(memberId, roomId).orElse(Long.MAX_VALUE);
        Client client = new Client(roomId, memberId, expiresAt, chatAfter, new SseEmitter(lifetime));
        clients.add(client);
        RoomClients room = rooms.compute(roomId, (id, previous) -> {
            RoomClients next = previous == null ? new RoomClients() : previous;
            next.clients.add(client);
            return next;
        });
        client.emitter.onCompletion(client::remove);
        client.emitter.onTimeout(client::close);
        client.emitter.onError(error -> client.remove());
        deliveries.submit(() -> {
            try {
                room.refresh(initial, queries);
                client.offer(room.view());
            } catch (RuntimeException exception) {
                client.close();
            }
        });
        return client.emitter;
    }

    private void tick() {
        if (!running || rooms.isEmpty()) {
            return;
        }
        Map<Long, RoomClients> polling = Map.copyOf(rooms);
        Map<Long, RhythmBattleRevisionResult> revisions;
        try {
            revisions = queries.findRevisions(polling.keySet());
        } catch (RuntimeException exception) {
            clients.forEach(Client::close);
            return;
        }
        polling.forEach((id, room) -> {
            RhythmBattleRevisionResult revision = revisions.get(id);
            if (revision == null) {
                room.clients.forEach(Client::close);
                return;
            }
            if (!room.changed(revision) && room.clients.stream().noneMatch(Client::behind)) {
                room.keepAlive();
                return;
            }
            if (!detailQueries.tryAcquire()) {
                return;
            }
            if (!room.polling.compareAndSet(false, true)) {
                detailQueries.release();
                return;
            }
            try {
                deliveries.submit(() -> {
                    try {
                        RhythmBattleRoomResult snapshot = room.snapshot != null
                                && room.snapshot.revision() >= revision.revision()
                                ? room.snapshot : queries.loadSnapshot(id);
                        room.refresh(snapshot, queries);
                        RoomView view = room.view();
                        for (Client client : List.copyOf(room.clients)) {
                            client.offer(view);
                        }
                    } catch (RuntimeException exception) {
                        room.clients.forEach(Client::close);
                    } finally {
                        room.polling.set(false);
                        detailQueries.release();
                    }
                });
            } catch (RejectedExecutionException exception) {
                room.polling.set(false);
                detailQueries.release();
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

    /**
     * 한 방의 연결들이 함께 쓰는 마지막 방 모습, 지금 판의 입력 묶음과 최근 채팅이다.
     */
    private static final class RoomClients {
        private final Set<Client> clients = ConcurrentHashMap.newKeySet();
        private final AtomicBoolean polling = new AtomicBoolean();
        private volatile RhythmBattleRoomResult snapshot;
        private volatile int batchGame = -1;
        private volatile List<RhythmBattleBatchResult> batches = List.of();
        private volatile List<RhythmBattleChatResult> chats = List.of();
        private volatile long chatLoaded;

        private boolean changed(RhythmBattleRevisionResult revision) {
            return snapshot == null || revision.revision() > snapshot.revision()
                    || revision.latestChatId() > chatLoaded;
        }

        private synchronized void refresh(RhythmBattleRoomResult next, RhythmBattleQueryService queries) {
            if (snapshot == null || next.revision() >= snapshot.revision()) {
                snapshot = next;
            }
            RhythmBattleRoomResult current = snapshot;
            if (current.gameNumber() != batchGame) {
                batchGame = current.gameNumber();
                batches = List.of();
            }
            if (current.gameNumber() > 0) {
                long after = batches.isEmpty() ? 0 : batches.getLast().id();
                List<RhythmBattleBatchResult> added = queries.findBatchesAfter(current.id(), current.gameNumber(), after);
                if (!added.isEmpty()) {
                    List<RhythmBattleBatchResult> merged = new ArrayList<>(batches);
                    merged.addAll(added);
                    batches = List.copyOf(merged);
                }
            }
            List<RhythmBattleChatResult> addedChats = queries.findChatsAfter(current.id(), chatLoaded);
            if (!addedChats.isEmpty()) {
                List<RhythmBattleChatResult> merged = new ArrayList<>(chats);
                merged.addAll(addedChats);
                chats = List.copyOf(merged.subList(Math.max(0, merged.size() - CHAT_CACHE), merged.size()));
                chatLoaded = addedChats.getLast().id();
            }
        }

        private RoomView view() {
            return new RoomView(snapshot, batchGame, batches, chats);
        }

        private void keepAlive() {
            RoomView view = snapshot == null ? null : view();
            if (view != null) {
                clients.forEach(client -> client.keepAlive(view));
            }
        }
    }

    private record RoomView(RhythmBattleRoomResult snapshot, int batchGame, List<RhythmBattleBatchResult> batches,
            List<RhythmBattleChatResult> chats) {
    }

    private final class Client {
        private final long roomId;
        private final long memberId;
        private final long expiresAt;
        private final long chatAfter;
        private final SseEmitter emitter;
        private final AtomicBoolean writing = new AtomicBoolean();
        private final AtomicBoolean closed = new AtomicBoolean();
        private volatile long sent = -1;
        private volatile int batchGame = -1;
        private volatile long batchSent;
        private volatile long chatSent;
        private volatile long lastSentAt;

        private Client(long roomId, long memberId, long expiresAt, long chatAfter, SseEmitter emitter) {
            this.roomId = roomId;
            this.memberId = memberId;
            this.expiresAt = expiresAt;
            this.chatAfter = chatAfter;
            this.emitter = emitter;
            this.lastSentAt = clock.millis();
        }

        private boolean behind() {
            return sent < 0;
        }

        private void keepAlive(RoomView view) {
            if (clock.millis() - lastSentAt >= 15_000L) {
                offer(view);
            }
        }

        private void offer(RoomView view) {
            if (!running || closed.get() || !writing.compareAndSet(false, true)) {
                return;
            }
            deliveries.submit(() -> {
                try {
                    deliver(view);
                } catch (IOException exception) {
                    remove();
                } catch (RuntimeException exception) {
                    close();
                } finally {
                    writing.set(false);
                }
            });
        }

        private void deliver(RoomView view) throws IOException {
            RhythmBattleRoomResult snapshot = view.snapshot();
            if (clock.millis() >= expiresAt || !snapshot.contains(memberId)) {
                close();
                return;
            }
            boolean wrote = false;
            if (snapshot.revision() > sent) {
                emitter.send(SseEmitter.event().name("snapshot").id(Long.toString(snapshot.revision()))
                        .reconnectTime(2000)
                        .data(RhythmBattleRoomResponse.from(snapshot.withServerNow(clock.millis()))));
                sent = snapshot.revision();
                wrote = true;
            }
            if (view.batchGame() != batchGame) {
                batchGame = view.batchGame();
                batchSent = 0;
            }
            List<RhythmBattleBatchResult> batches = view.batches().stream()
                    .filter(batch -> batch.id() > batchSent).toList();
            if (!batches.isEmpty()) {
                emitter.send(SseEmitter.event().name("batches")
                        .data(RhythmBattleStreamEvents.Batches.of(view.batchGame(), batches)));
                batchSent = batches.getLast().id();
                wrote = true;
            }
            List<RhythmBattleChatResult> chats = view.chats().stream()
                    .filter(message -> message.id() > Math.max(chatSent, chatAfter)).toList();
            if (!chats.isEmpty() && snapshot.status() != BattleRoomStatus.CLOSED) {
                emitter.send(SseEmitter.event().name("chat").data(RhythmBattleStreamEvents.Chat.of(chats)));
                chatSent = chats.getLast().id();
                wrote = true;
            }
            if (!wrote && clock.millis() - lastSentAt >= 15_000L) {
                emitter.send(SseEmitter.event().comment("keepalive"));
                wrote = true;
            }
            if (wrote) {
                lastSentAt = clock.millis();
            }
            if (snapshot.status() == BattleRoomStatus.CLOSED) {
                close();
            }
        }

        private void remove() {
            closed.set(true);
            clients.remove(this);
            rooms.computeIfPresent(roomId, (id, room) -> {
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
                    // 서블릿이 종료나 연결 끊김으로 이미 끝냈을 수 있다.
                }
            }
        }
    }
}

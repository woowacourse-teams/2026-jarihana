package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.project.jarihana.realtime.TestSettings;
import com.project.jarihana.realtime.auth.AdmissionTokenVerifier.Identity;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.room.runtime.RoomRuntime;
import com.project.jarihana.realtime.transport.websocket.Peer;
import com.project.jarihana.realtime.transport.websocket.RealtimeSocketMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class RoomRuntimeTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final TestSettings.MutableClock clock = new TestSettings.MutableClock();
    private final RealtimeSocketMetrics socketMetrics = new RealtimeSocketMetrics(new SimpleMeterRegistry());

    @Test
    void intentionalLeaveImmediatelyReleasesSeatDropsHeldItemAndCancelsProduction() throws Exception {
        List<JsonNode> own = new ArrayList<>(), observed = new ArrayList<>();
        Peer leaving = peer("a", own), observer = peer("b", "2", observed);
        RoomRuntime room = runtime(Runnable::run, () -> {});
        room.join(leaving, TestRooms.admission("1"), TestRooms.layout(1, 0));
        room.join(observer, TestRooms.admission("2"), TestRooms.layout(1, 0));
        room.message(leaving, command(own.getFirst(), "cup", Map.of("action", "TAKE", "assetId", "machine", "kind", "cup")));
        room.message(leaving, command(own.getFirst(), "produce", Map.of("action", "PRODUCE", "assetId", "machine", "kind", "coffee")));
        room.message(leaving, command(own.getFirst(), "cookie", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cookie")));
        room.message(leaving, command(own.getFirst(), "seat", Map.of("action", "SIT", "assetId", "sofa", "slot", 0)));
        assertThat(observed.getLast().path("participants").get(0).path("seat").isNull()).isFalse();
        leaving.disconnected(clock.millis());
        room.leave(leaving);
        JsonNode state = observed.getLast();
        assertThat(state.path("participants").size()).isEqualTo(1);
        assertThat(state.path("participants").get(0).path("memberId").asString()).isEqualTo("2");
        assertThat(state.path("assets").path("machine").path("production").isNull()).isTrue();
        JsonNode cookie = null;
        for (JsonNode item : state.path("items")) if (item.path("kind").asString().equals("cookie")) cookie = item;
        assertThat(cookie).isNotNull();
        assertThat(cookie.path("location").asString()).isEqualTo("WORLD");
        room.message(observer, command(observed.getFirst(), "take-seat", Map.of("action", "SIT", "assetId", "sofa", "slot", 0)));
        assertThat(observed.getLast().path("participants").get(0).path("seat").path("slot").asInt(-1)).isZero();
    }

    @Test
    void unexpectedDisconnectRetainsStateUntilGraceExpires() throws Exception {
        List<JsonNode> own = new ArrayList<>(), observed = new ArrayList<>();
        Peer disconnected = peer("a", own), observer = peer("b", "2", observed);
        RoomRuntime room = runtime(Runnable::run, () -> {});
        room.join(disconnected, TestRooms.admission("1"), TestRooms.layout(1, 0));
        room.join(observer, TestRooms.admission("2"), TestRooms.layout(1, 0));
        disconnected.disconnected(1000);
        clock.set(1099); room.tick();
        room.message(observer, context(observed.getFirst(), "RESYNC"));
        assertThat(observed.getLast().path("participants").size()).isEqualTo(2);
        clock.set(1101); room.tick();
        assertThat(observed.getLast().path("participants").size()).isEqualTo(1);
    }

    @Test
    void staleIntentionalLeaveCannotRemoveReplacement() throws Exception {
        List<JsonNode> messages = new ArrayList<>();
        Peer old = peer("old", new ArrayList<>()), current = peer("new", messages);
        RoomRuntime room = runtime(Runnable::run, () -> {});
        room.join(old, TestRooms.admission("1"), TestRooms.layout(1, 0));
        room.join(current, TestRooms.admission("1"), TestRooms.layout(1, 0));
        room.leave(old);
        room.message(current, context(messages.getFirst(), "RESYNC"));
        assertThat(messages.getLast().path("participants").size()).isEqualTo(1);
        assertThat(current.isClosed()).isFalse();
    }

    @Test
    void leavingLastParticipantDoesNotDiscardAnAlreadyQueuedJoin() throws Exception {
        List<Runnable> scheduled = new ArrayList<>();
        Peer old = peer("old", new ArrayList<>()), incoming = peer("new", "2", new ArrayList<>());
        RoomRuntime room = runtime(scheduled::add, () -> {});
        room.join(old, TestRooms.admission("1"), TestRooms.layout(1, 0)); scheduled.removeFirst().run();
        old.disconnected(1000); room.leave(old); room.tick();
        room.join(incoming, TestRooms.admission("2"), TestRooms.layout(1, 0));
        scheduled.removeFirst().run();
        assertThat(room.isClosed()).isFalse();
        assertThat(incoming.isJoined()).isTrue();
    }

    @Test
    void snapshotPrecedesDeltasAndDuplicateCommandHasOneEffect() throws Exception {
        List<JsonNode> messages = new ArrayList<>();
        Peer peer = peer("a", messages);
        RoomRuntime room = runtime(Runnable::run, () -> {});
        room.join(peer, TestRooms.admission("1"), TestRooms.layout(1, 0));
        assertThat(messages.getFirst().path("type").asString()).isEqualTo("ROOM_SNAPSHOT");
        var take = command(messages.getFirst(), "take-1", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cookie"));
        room.message(peer, take); room.message(peer, take);
        assertThat(messages.stream().filter(message -> message.path("type").asString().equals("COMMAND_RESULT"))).hasSize(2);
        JsonNode state = messages.stream().filter(message -> message.path("type").asString().equals("ROOM_STATE")).reduce((first, second) -> second).orElseThrow();
        assertThat(state.path("items").size()).isEqualTo(1);
    }

    @Test
    void olderAdmissionCompletionCannotReplaceNewerConnection() throws Exception {
        Peer older = peer("old", new ArrayList<>()), newer = peer("new", new ArrayList<>());
        RoomRuntime room = runtime(Runnable::run, () -> {});
        room.join(newer, TestRooms.admission("1"), TestRooms.layout(1, 0));
        room.join(older, TestRooms.admission("1"), TestRooms.layout(1, 0));
        assertThat(older.isClosed()).isTrue();
        assertThat(newer.isClosed()).isFalse();
    }

    @Test
    void failedInitialJoinDoesNotLeakRoomCapacity() throws Exception {
        Peer peer = peer("closed", new ArrayList<>());
        peer.disconnected(1000);
        AtomicBoolean removed = new AtomicBoolean();
        RoomRuntime room = runtime(Runnable::run, () -> removed.set(true));
        room.join(peer, TestRooms.admission("1"), TestRooms.layout(1, 0));
        clock.set(6001); room.tick();
        assertThat(room.isClosed()).isTrue();
        assertThat(removed).isTrue();
    }

    @Test
    void expiredLeasePreventsCommandsEvenBeforeCleanupTick() throws Exception {
        List<JsonNode> messages = new ArrayList<>(); Peer peer = peer("a", messages);
        RoomRuntime room = runtime(Runnable::run, () -> {});
        room.join(peer, TestRooms.admission("1"), TestRooms.layout(1, 0));
        clock.set(100001);
        room.message(peer, command(messages.getFirst(), "expired", Map.of("action", "TAKE", "assetId", "shelf", "kind", "cup")));
        assertThat(peer.isClosed()).isTrue();
        assertThat(messages.stream().anyMatch(message -> message.path("items").size() > 0)).isFalse();
    }

    @Test
    void concurrentTerminationWaitsForJoinAndClosesItsPeer() throws Exception {
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("race"); when(socket.isOpen()).thenReturn(true);
        CountDownLatch sending = new CountDownLatch(1), release = new CountDownLatch(1), removed = new CountDownLatch(1);
        doAnswer(invocation -> { sending.countDown(); assertThat(release.await(5, TimeUnit.SECONDS)).isTrue(); return null; }).when(socket).sendMessage(any());
        Peer peer = new Peer(socket, mapper, Runnable::run, Runnable::run, 262144, 1000, socketMetrics);
        peer.identify(new Identity(RealtimeEnvironment.DEV, "1", "7", "token", 61000));
        try (var pool = Executors.newFixedThreadPool(2)) {
            RoomRuntime room = runtime(pool, removed::countDown);
            room.join(peer, TestRooms.admission("1"), TestRooms.layout(1, 0));
            assertThat(sending.await(5, TimeUnit.SECONDS)).isTrue();
            var termination = pool.submit(() -> room.terminate("ACCESS_DENIED"));
            release.countDown(); termination.get(5, TimeUnit.SECONDS);
            assertThat(removed.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(peer.isClosed()).isTrue();
            assertThat(room.isClosed()).isTrue();
        }
    }

    @Test
    void movementCoalescingStopsAtCommands() throws Exception {
        List<Runnable> scheduled = new ArrayList<>(); List<JsonNode> messages = new ArrayList<>();
        Peer peer = peer("a", messages); RoomRuntime room = runtime(scheduled::add, () -> {});
        room.join(peer, TestRooms.admission("1"), TestRooms.layout(1, 0)); scheduled.removeFirst().run();
        JsonNode state = messages.getFirst();
        for (int seq = 1; seq <= 10; seq++) {
            Map<String, Object> move = context(state, "MOVE"); move.put("moveSeq", seq);
            move.put("payload", Map.of("x", 0, "y", 0, "z", 2.4, "yaw", seq * .01, "locomotion", "idle"));
            room.message(peer, move);
        }
        room.message(peer, command(state, "wave", Map.of("action", "EMOTE", "kind", "wave")));
        Map<String, Object> move = context(state, "MOVE"); move.put("moveSeq", 11);
        move.put("payload", Map.of("x", 0, "y", 0, "z", 2.4, "yaw", .11, "locomotion", "idle"));
        room.message(peer, move);
        assertThat(room.queued()).isEqualTo(3);
        scheduled.removeFirst().run();
        JsonNode control = messages.stream().filter(message -> message.path("type").asString().equals("ROOM_STATE")).reduce((a, b) -> b).orElseThrow();
        assertThat(control.path("participants").get(0).path("yaw").asDouble()).isEqualTo(.10);
    }

    @Test
    void tracedMovementBatchesAreProcessedInOrderWithoutDroppingTheirStart() throws Exception {
        List<Runnable> scheduled = new ArrayList<>(); List<JsonNode> messages = new ArrayList<>();
        Peer peer = peer("trace", messages); RoomRuntime room = runtime(scheduled::add, () -> {});
        room.join(peer, TestRooms.admission("1"), TestRooms.layout(1, 0)); scheduled.removeFirst().run();
        var initial = messages.getFirst();
        for (int seq = 1; seq <= 4; seq++) {
            var move = context(initial, "MOVE"); move.put("moveSeq", seq);
            var from = Map.of("x", (seq - 1) * .1, "y", 0, "z", 2.4);
            var to = Map.of("x", seq * .1, "y", 0, "z", 2.4);
            move.put("payload", Map.of("x", seq * .1, "y", 0, "z", 2.4, "yaw", 0,
                    "locomotion", "walking", "path", List.of(from, to)));
            room.message(peer, move);
        }
        clock.set(1500); scheduled.removeFirst().run();
        room.message(peer, context(initial, "RESYNC")); scheduled.removeFirst().run();
        assertThat(messages.stream().filter(message -> message.path("type").asString().equals("ERROR"))).isEmpty();
        assertThat(messages.getLast().path("participants").get(0).path("position").path("x").asDouble()).isEqualTo(.4);
    }

    private RoomRuntime runtime(java.util.concurrent.Executor executor, Runnable removed) {
        return new RoomRuntime("7", TestRooms.layout(1, 0), TestSettings.properties("unused", "unused"), executor, clock, removed);
    }

    private Peer peer(String id, List<JsonNode> messages) throws Exception {
        return peer(id, "1", messages);
    }

    private Peer peer(String id, String memberId, List<JsonNode> messages) throws Exception {
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(id); when(socket.isOpen()).thenReturn(true);
        doAnswer(invocation -> { messages.add(mapper.readTree(((TextMessage) invocation.getArgument(0)).getPayload())); return null; }).when(socket).sendMessage(any());
        Peer peer = new Peer(socket, mapper, Runnable::run, Runnable::run, 262144, 1000, socketMetrics);
        peer.identify(new Identity(RealtimeEnvironment.DEV, memberId, "7", "token", 61000));
        return peer;
    }

    private Map<String, Object> command(JsonNode state, String id, Map<String, Object> payload) {
        var message = context(state, "COMMAND"); message.put("commandId", id); message.put("payload", payload); return message;
    }

    private Map<String, Object> context(JsonNode state, String type) {
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", type); message.put("roomEpoch", state.path("roomEpoch").asString());
        message.put("connectionGeneration", state.path("connectionGeneration").asString());
        message.put("layoutRevision", state.path("layoutRevision").asLong()); return message;
    }
}

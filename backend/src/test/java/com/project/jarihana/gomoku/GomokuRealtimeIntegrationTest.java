package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;

import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

class GomokuRealtimeIntegrationTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/gomoku/rooms";
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("참가자는 최초 상태와 변경 이벤트를 받고 재연결 시 최신 상태를 받는다")
    void streamsSnapshotsAndReconnects() throws Exception {
        // Given
        String host = member("가을", "stream-host");
        String guest = member("겨울", "stream-guest");
        long roomId = create(host);
        long initialRevision;
        long joinedRevision;
        try (SnapshotStream stream = openStream(host, roomId, null)) {
            SnapshotEvent initial = stream.next();
            initialRevision = initial.snapshot().getLong("revision");
            assertEquals(roomId, initial.snapshot().getLong("id"));
            assertEquals(Long.toString(initialRevision), initial.id());
            assertFalse(initial.snapshot().getBoolean("hostReady"));
            assertEquals(
                    "https://avatars.githubusercontent.com/u/stream-host",
                    initial.snapshot().getString("hostAvatarUrl"));
            assertNull(initial.snapshot().get("guestAvatarUrl"));
            assertEquals("0".repeat(225), initial.snapshot().getString("board"));
            assertNotNull(initial.snapshot().get("serverNow"));

            // When
            request(guest)
                    .body(Map.of())
                    .post(ROOT + "/" + roomId + "/join")
                    .then()
                    .statusCode(200);

            // Then
            SnapshotEvent joined = stream.next();
            joinedRevision = joined.snapshot().getLong("revision");
            assertTrue(joinedRevision > initialRevision);
            assertEquals(Long.toString(joinedRevision), joined.id());
            assertNotNull(joined.snapshot().get("guestMemberId"));
            assertEquals(
                    "https://avatars.githubusercontent.com/u/stream-guest",
                    joined.snapshot().getString("guestAvatarUrl"));
        }

        // When
        request(host)
                .body(Map.of("ready", true, "gameNumber", 1))
                .put(ROOT + "/" + roomId + "/ready")
                .then()
                .statusCode(200);

        // Then
        try (SnapshotStream reconnected =
                openStream(host, roomId, Long.toString(initialRevision))) {
            SnapshotEvent latest = reconnected.next();
            assertTrue(latest.snapshot().getLong("revision") > joinedRevision);
            assertTrue(latest.snapshot().getBoolean("hostReady"));
            assertEquals(Long.toString(latest.snapshot().getLong("revision")), latest.id());
            closeRoom(host, roomId, reconnected);
        }
    }

    @Test
    @DisplayName("공유 DB에 직접 반영된 변경도 이벤트 스트림에 전달한다")
    void streamsCommittedDatabaseChangesWithoutLocalPublication() throws Exception {
        // Given
        String host = member("가을", "database-stream-host");
        String guest = member("겨울", "database-stream-guest");
        long roomId = create(host);
        request(guest).body(Map.of()).post(ROOT + "/" + roomId + "/join").then().statusCode(200);
        try (SnapshotStream stream = openStream(host, roomId, null)) {
            long revision = stream.next().snapshot().getLong("revision");

            // When
            assertEquals(
                    1,
                    jdbc.update(
                            "update gomoku_room set host_ready=true, revision=revision+1 where"
                                + " id=?",
                            roomId));

            // Then
            SnapshotEvent updated = stream.next();
            assertEquals(revision + 1, updated.snapshot().getLong("revision"));
            assertTrue(updated.snapshot().getBoolean("hostReady"));
            closeRoom(host, roomId, stream);
        }
    }

    @Test
    @DisplayName("공개 방도 참가자가 아니면 이벤트 스트림을 열 수 없다")
    void deniesOutsiderStream() {
        // Given
        String host = member("가을", "stream-owner");
        String outsider = member("봄날", "stream-outsider");
        long roomId = create(host);

        // When / Then
        request(outsider).get(ROOT + "/" + roomId + "/events").then().statusCode(403);
        request(outsider)
                .accept("text/event-stream")
                .get(ROOT + "/" + roomId + "/events")
                .then()
                .statusCode(403)
                .contentType("application/json");
        request(host)
                .accept("text/event-stream")
                .get(ROOT + "/999999999/events")
                .then()
                .statusCode(404)
                .contentType("application/json");
        given().get(ROOT + "/" + roomId + "/events").then().statusCode(401);
    }

    @Test
    @DisplayName("마지막 참가 자리를 동시에 요청하면 한 회원만 입장한다")
    void admitsExactlyOneConcurrentGuest() throws Exception {
        // Given
        String host = member("가을", "join-owner");
        String first = member("겨울", "join-first");
        String second = member("봄날", "join-second");
        long roomId = create(host);
        RequestSpecification firstRequest = request(first);
        RequestSpecification secondRequest = request(second);

        // When
        List<Integer> statuses =
                concurrently(
                        () ->
                                firstRequest
                                        .body(Map.of())
                                        .post(ROOT + "/" + roomId + "/join")
                                        .statusCode(),
                        () ->
                                secondRequest
                                        .body(Map.of())
                                        .post(ROOT + "/" + roomId + "/join")
                                        .statusCode());

        // Then
        assertEquals(List.of(200, 409), statuses.stream().sorted().toList());
        assertNotNull(request(host).get(ROOT + "/" + roomId).jsonPath().get("data.guestMemberId"));
        String rejected = statuses.get(0) == 409 ? first : second;
        request(rejected).get(ROOT + "/" + roomId + "/events").then().statusCode(403);
    }

    @Test
    @DisplayName("한 회원의 동시 방 생성 요청은 하나만 성공한다")
    void createsExactlyOneConcurrentRoomPerMember() throws Exception {
        // Given
        String host = member("가을", "create-race");
        RequestSpecification firstRequest = request(host);
        RequestSpecification secondRequest = request(host);
        Map<String, String> body = Map.of("visibility", "PUBLIC", "rule", "RENJU");

        // When
        List<Integer> statuses =
                concurrently(
                        () -> firstRequest.body(body).post(ROOT).statusCode(),
                        () -> secondRequest.body(body).post(ROOT).statusCode());

        // Then
        assertEquals(List.of(201, 409), statuses.stream().sorted().toList());
        assertEquals(1, given().get(ROOT).jsonPath().getList("data.items").size());
        request(host).get(ROOT + "/me").then().statusCode(200);
    }

    @Test
    @DisplayName("이전 판의 준비 요청을 재전송하면 재대국 준비 상태를 바꾸지 않는다")
    void rejectsStaleReadyAfterFinishedGame() {
        // Given
        String host = member("가을", "ready-host");
        String guest = member("겨울", "ready-guest");
        long roomId = create(host);
        request(guest).body(Map.of()).post(ROOT + "/" + roomId + "/join").then().statusCode(200);
        ready(host, roomId, 1);
        ready(guest, roomId, 1);
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/" + roomId + "/start").then().statusCode(200);
        request(host)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + roomId + "/resign")
                .then()
                .statusCode(200);
        long revision = request(host).get(ROOT + "/" + roomId).jsonPath().getLong("data.revision");

        // When
        request(host)
                .body(Map.of("ready", true, "gameNumber", 1))
                .put(ROOT + "/" + roomId + "/ready")
                .then()
                .statusCode(409);

        // Then
        JsonPath snapshot = request(host).get(ROOT + "/" + roomId).jsonPath();
        assertFalse(snapshot.getBoolean("data.hostReady"));
        assertEquals(revision, snapshot.getLong("data.revision"));
        ready(host, roomId, 2);
        assertTrue(request(host).get(ROOT + "/" + roomId).jsonPath().getBoolean("data.hostReady"));
    }

    @Test
    @DisplayName("동시에 시작을 요청해도 한 번만 시작하고 대기 snapshot의 준비 상태를 전달한다")
    void startsOnlyOnceUnderConcurrentHostRequests() throws Exception {
        // Given
        String host = member("가을", "concurrent-start-host");
        String guest = member("겨울", "concurrent-start-guest");
        long roomId = create(host);
        request(guest).body(Map.of()).post(ROOT + "/" + roomId + "/join").then().statusCode(200);
        try (var stream = openStream(host, roomId, null)) {
            stream.next();
            ready(host, roomId, 1);
            stream.next();
            ready(guest, roomId, 1);
            JsonPath prepared = stream.next().snapshot();
            assertEquals("WAITING", prepared.getString("status"));
            assertTrue(prepared.getBoolean("hostReady"));
            assertTrue(prepared.getBoolean("guestReady"));
            // When
            var statuses = concurrently(
                    () -> request(host)
                            .body(Map.of("gameNumber", 1))
                            .post(ROOT + "/" + roomId + "/start")
                            .statusCode(),
                    () -> request(host)
                            .body(Map.of("gameNumber", 1))
                            .post(ROOT + "/" + roomId + "/start")
                            .statusCode());
            // Then
            assertEquals(1L, statuses.stream().filter(status -> status == 200).count());
            assertEquals(1L, statuses.stream().filter(status -> status == 409).count());
            assertEquals(1, request(host).get(ROOT + "/" + roomId).jsonPath().getInt("data.gameNumber"));
        }
    }

    private List<Integer> concurrently(Callable<Integer> first, Callable<Integer> second)
            throws Exception {
        CountDownLatch waiting = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = new ArrayList<java.util.concurrent.Future<Integer>>();
            for (Callable<Integer> operation : List.of(first, second)) {
                futures.add(
                        executor.submit(
                                () -> {
                                    waiting.countDown();
                                    assertTrue(start.await(10, TimeUnit.SECONDS));
                                    return operation.call();
                                }));
            }
            try {
                assertTrue(waiting.await(10, TimeUnit.SECONDS));
            } finally {
                start.countDown();
            }
            return List.of(
                    futures.get(0).get(15, TimeUnit.SECONDS),
                    futures.get(1).get(15, TimeUnit.SECONDS));
        }
    }

    private SnapshotStream openStream(String token, long roomId, String lastEventId)
            throws Exception {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(
                                URI.create(
                                        "http://localhost:"
                                                + RestAssured.port
                                                + RestAssured.basePath
                                                + ROOT
                                                + "/"
                                                + roomId
                                                + "/events"))
                        .header("Accept", "text/event-stream")
                        .header("Cookie", cookies.accessTokenName() + "=" + token);
        if (lastEventId != null) {
            builder.header("Last-Event-ID", lastEventId);
        }
        HttpResponse<InputStream> response =
                client.sendAsync(builder.GET().build(), HttpResponse.BodyHandlers.ofInputStream())
                        .get(10, TimeUnit.SECONDS);
        assertEquals(200, response.statusCode());
        assertTrue(
                response.headers()
                        .firstValue("content-type")
                        .orElse("")
                        .startsWith("text/event-stream"));
        return new SnapshotStream(client, response.body());
    }

    private void closeRoom(String token, long roomId, SnapshotStream stream)
            throws InterruptedException {
        request(token).post(ROOT + "/" + roomId + "/leave").then().statusCode(200);
        assertEquals("CLOSED", stream.next().snapshot().getString("status"));
    }

    private void ready(String token, long roomId, int gameNumber) {
        request(token)
                .body(Map.of("ready", true, "gameNumber", gameNumber))
                .put(ROOT + "/" + roomId + "/ready")
                .then()
                .statusCode(200);
    }

    private long create(String token) {
        return request(token)
                .body(Map.of("visibility", "PUBLIC", "rule", "RENJU"))
                .post(ROOT)
                .then()
                .statusCode(201)
                .extract()
                .jsonPath()
                .getLong("data.roomId");
    }

    private String member(String name, String github) {
        return tokens.issue(members.save(Member.create(name, 23, github, Course.BACKEND)).getId())
                .value();
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json")
                .cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf)
                .cookie(cookies.accessTokenName(), token);
    }

    private record SnapshotEvent(String id, JsonPath snapshot) {}

    private static final class SnapshotStream implements AutoCloseable {
        private final HttpClient client;
        private final InputStream input;
        private final BlockingQueue<SnapshotEvent> events = new LinkedBlockingQueue<>();
        private final Thread reader;
        private volatile Exception failure;
        private volatile boolean closed;

        private SnapshotStream(HttpClient client, InputStream input) {
            this.client = client;
            this.input = input;
            reader = Thread.ofVirtual().start(this::readEvents);
        }

        private void readEvents() {
            try (var lines =
                    new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                String event = "";
                String id = "";
                StringBuilder data = new StringBuilder();
                String line;
                while ((line = lines.readLine()) != null) {
                    if (line.isEmpty()) {
                        if (event.equals("snapshot") && !data.isEmpty()) {
                            events.add(new SnapshotEvent(id, new JsonPath(data.toString())));
                        }
                        event = "";
                        id = "";
                        data = new StringBuilder();
                    } else if (line.startsWith("event:")) {
                        event = line.substring(6).stripLeading();
                    } else if (line.startsWith("id:")) {
                        id = line.substring(3).stripLeading();
                    } else if (line.startsWith("data:")) {
                        if (!data.isEmpty()) data.append('\n');
                        data.append(line.substring(5).stripLeading());
                    }
                }
            } catch (Exception exception) {
                if (!closed) failure = exception;
            }
        }

        private SnapshotEvent next() throws InterruptedException {
            SnapshotEvent event = events.poll(10, TimeUnit.SECONDS);
            assertNotNull(
                    event, () -> "No snapshot event within 10 seconds; reader failure: " + failure);
            return event;
        }

        @Override
        public void close() throws Exception {
            closed = true;
            input.close();
            reader.interrupt();
            reader.join(2000);
            client.shutdownNow();
        }
    }
}

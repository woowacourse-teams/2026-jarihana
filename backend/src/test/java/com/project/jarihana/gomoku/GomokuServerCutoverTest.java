package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.project.jarihana.auth.config.JwtProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.testcontainers.Testcontainers;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;

@Tag("gomoku-cutover")
class GomokuServerCutoverTest {
    private static final String ROOT = "/games/gomoku";
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer("postgres:17");
    private static final AccessTokenProvider TOKENS = new AccessTokenProvider(
            new JwtProperties("test-access-token-secret-key-for-hmac-sha256-0001", Duration.ofHours(1)),
            Clock.system(ZONE));
    private static DriverManagerDataSource dataSource;
    private static JdbcTemplate jdbc;
    private Server oldServer;
    private Server newServer;
    private Path logs;

    @BeforeAll
    static void startDatabase() {
        DATABASE.start();
        dataSource = new DriverManagerDataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        jdbc = new JdbcTemplate(dataSource);
    }

    @AfterAll
    static void stopDatabase() {
        DATABASE.stop();
    }

    @BeforeEach
    void startServers(TestInfo test) throws Exception {
        logs = Path.of("build", "gomoku-cutover", test.getTestMethod().orElseThrow().getName());
        Files.createDirectories(logs);
        oldServer = Server.start("gomoku-cutover-old", logs.resolve("old.log"));
        newServer = Server.start("gomoku-cutover-new", logs.resolve("new.log"));
        assertNotEquals(oldServer.process.pid(), newServer.process.pid());
        assertNotEquals(oldServer.port, newServer.port);
        // These external JVMs are not Spring test contexts, so use the shared cleanup script directly.
        new ResourceDatabasePopulator(new ClassPathResource("sql/truncate.sql")).execute(dataSource);
        System.out.printf("old pid=%d port=%d; new pid=%d port=%d%n",
                oldServer.process.pid(), oldServer.port, newServer.process.pid(), newServer.port);
    }

    @AfterEach
    void stopServers() throws Exception {
        try {
            if (oldServer != null) oldServer.close();
        } finally {
            if (newServer != null) newServer.close();
        }
    }

    @Test
    @DisplayName("이전 서버의 판을 새 서버에서 승리하고 재대결과 재요청에도 기록을 보존한다")
    void keepsVictoryAndRematchAcrossServers() {
        // Given
        Player host = member("가온", "cutover-host"), guest = member("해솔", "cutover-guest");
        long room = startRoom(oldServer, host, guest);
        long record = recordId(room, 1);
        long blackId = snapshot(oldServer, host, room).getLong("data.blackMemberId");
        Player black = blackId == host.id() ? host : guest;
        Player white = blackId == host.id() ? guest : host;
        Map<String, Object> finalMove = moveBody(8, 4, 0);

        // When
        for (int ply = 0; ply < 9; ply++) {
            Server server = ply < 4 ? oldServer : newServer;
            Player actor = ply % 2 == 0 ? black : white;
            Object body = ply == 8 ? finalMove : moveBody(ply, ply / 2, ply % 2);
            server.request(actor).body(body).post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);
        }
        oldServer.request(black).body(finalMove).post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);

        // Then
        assertRecord(room, 1, record, "FIVE", black.id(), 9);
        assertHistory(oldServer, host, 1);
        assertHistory(newServer, host, 1);

        // When: requests can still reach the previous server during connection draining.
        start(newServer, host, guest, room, 2);
        oldServer.request(host).body(Map.of("gameNumber", 2))
                .post(ROOT + "/rooms/" + room + "/resign").then().statusCode(200);

        // Then
        assertRecord(room, 2, recordId(room, 2), "RESIGN", guest.id(), 0);
        for (Server server : new Server[] {oldServer, newServer}) {
            assertHistory(server, host, 2);
            assertHistory(server, guest, 2);
            server.request(host).get(ROOT + "/history/me/summary").then().statusCode(200)
                    .body("data.wins", equalTo(black.id() == host.id() ? 1 : 0))
                    .body("data.losses", equalTo(black.id() == host.id() ? 1 : 2));
            server.request(host).get(ROOT + "/ranking").then().statusCode(200)
                    .body("data.me.total", equalTo(2));
        }
    }

    @Test
    @DisplayName("두 서버의 실제 만료 작업이 같은 방 잠금을 기다려도 시간패를 한 번만 저장한다")
    void recordsOneTimeoutWhenBothWorkersContend() throws Exception {
        // Given
        Player host = member("가온", "expiry-host"), guest = member("해솔", "expiry-guest");
        long room = startRoom(oldServer, host, guest);
        long record = recordId(room, 1);
        JsonPath before = snapshot(newServer, host, room);
        long winner = before.getLong("data.blackMemberId") == host.id() ? guest.id() : host.id();
        LocalDateTime deadline = LocalDateTime.now(ZONE).plusSeconds(2).withNano(0);
        jdbc.update("update gomoku_room set turn_deadline=? where id=?", deadline, room);

        // When: hold the room lock until both real scheduler threads are waiting for it.
        try (Connection lock = dataSource.getConnection()) {
            lock.setAutoCommit(false);
            try (var statement = lock.prepareStatement("select id from gomoku_room where id=? for update")) {
                statement.setLong(1, room);
                statement.executeQuery().close();
            }
            await(() -> jdbc.queryForObject("""
                    select count(distinct application_name) from pg_stat_activity
                    where application_name in ('gomoku-cutover-old', 'gomoku-cutover-new')
                      and wait_event_type='Lock' and query like '%gomoku_room%'
                    """, Integer.class) == 2, "Both expiration workers must contend for the room lock");
            lock.commit();
        }

        // Then
        await(() -> completed(room), "A scheduler must complete the history record");
        await(() -> jdbc.queryForObject("""
                select count(*) from pg_stat_activity
                where application_name in ('gomoku-cutover-old', 'gomoku-cutover-new')
                  and xact_start is not null
                """, Integer.class) == 0, "Both scheduler transactions must finish before checking for duplicates");
        assertRecord(room, 1, record, "TIMEOUT", winner, 0);
        assertEquals(deadline, jdbc.queryForObject(
                "select ended_at from gomoku_game where id=?", LocalDateTime.class, record));
        assertEquals(before.getLong("data.revision") + 1,
                jdbc.queryForObject("select revision from gomoku_room where id=?", Long.class, room));
        assertHistory(oldServer, host, 1);
        assertHistory(newServer, host, 1);
        assertHistory(newServer, guest, 1);
    }

    @Test
    @DisplayName("이전 JVM을 종료한 뒤 새 서버가 착수와 시간패 및 재대결 기록을 이어서 저장한다")
    void continuesAndExpiresAfterOldServerStops() throws Exception {
        // Given
        Player host = member("가온", "shutdown-host"), guest = member("해솔", "shutdown-guest");
        long room = startRoom(oldServer, host, guest);
        long record = recordId(room, 1);
        long blackId = snapshot(oldServer, host, room).getLong("data.blackMemberId");
        Player black = blackId == host.id() ? host : guest;
        Player white = blackId == host.id() ? guest : host;
        oldServer.request(black).body(moveBody(0, 0, 0))
                .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);

        // When
        assertTrue(oldServer.process.isAlive());
        oldServer.close();
        assertFalse(oldServer.process.isAlive());
        assertEquals(1, snapshot(newServer, host, room).getInt("data.ply"));
        newServer.request(white).body(moveBody(1, 0, 1))
                .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);
        jdbc.update("update gomoku_room set turn_deadline=? where id=?", LocalDateTime.now(ZONE).minusSeconds(1), room);

        // Then
        await(() -> completed(room), "The surviving server must expire the game");
        assertRecord(room, 1, record, "TIMEOUT", white.id(), 2);
        assertHistory(newServer, host, 1);
        assertHistory(newServer, guest, 1);
        assertEquals(2, snapshot(newServer, host, room).getInt("data.ply"));

        // When / Then
        start(newServer, host, guest, room, 2);
        newServer.request(host).body(Map.of("gameNumber", 2))
                .post(ROOT + "/rooms/" + room + "/resign").then().statusCode(200);
        assertHistory(newServer, host, 2);
    }

    @Test
    @DisplayName("실제 Nginx reload 후 새 서버에서 승리해도 이전 SSE 연결과 대전기록을 유지한다")
    void keepsVictoryAcrossNginxReload() throws Exception {
        // Given
        Player host = member("가온", "nginx-host"), guest = member("해솔", "nginx-guest");
        try (Nginx proxy = Nginx.start(oldServer, newServer, logs)) {
            long room = startRoom(proxy, host, guest);
            long record = recordId(room, 1);
            long blackId = snapshot(proxy, host, room).getLong("data.blackMemberId");
            Player black = blackId == host.id() ? host : guest;
            Player white = blackId == host.id() ? guest : host;
            Map<String, Object> finalMove = moveBody(8, 4, 0);
            try (SnapshotStream stream = new SnapshotStream(proxy, host, room, oldServer.port)) {
                stream.awaitPly(0);
                for (int ply = 0; ply < 4; ply++) {
                    Player actor = ply % 2 == 0 ? black : white;
                    proxy.request(actor).body(moveBody(ply, ply / 2, ply % 2))
                            .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200)
                            .header("X-Gomoku-Test-Upstream", endsWith(":" + oldServer.port));
                }
                stream.awaitPly(4);

                // When: reload the same Nginx master while an old worker holds the SSE request.
                proxy.switchTo(newServer, "new");
                assertFalse(Collections.disjoint(proxy.previousWorkers, proxy.workerIds()));
                for (int ply = 4; ply < 9; ply++) {
                    Player actor = ply % 2 == 0 ? black : white;
                    proxy.request(actor).body(ply == 8 ? finalMove : moveBody(ply, ply / 2, ply % 2))
                            .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200)
                            .header("X-Gomoku-Test-Upstream", endsWith(":" + newServer.port));
                }
                proxy.request(black).body(finalMove).post(ROOT + "/rooms/" + room + "/moves")
                        .then().statusCode(200);

                // Then: the original stream observes a result committed by the new JVM.
                JsonPath ended = stream.awaitPly(9);
                assertEquals("FIVE", ended.getString("endReason"));
                assertEquals(black.id(), ended.getLong("winnerMemberId"));
            }
            proxy.awaitDrained();
            assertRecord(room, 1, record, "FIVE", black.id(), 9);
            assertHistory(proxy, host, 1);
            assertHistory(proxy, guest, 1);
            proxy.request(black).get(ROOT + "/history/me/summary").then().statusCode(200)
                    .body("data.wins", equalTo(1)).body("data.winRate", equalTo(100.0f));
            proxy.assertAccess("POST", ROOT + "/rooms/" + room + "/start", oldServer);
            proxy.assertAccess("POST", ROOT + "/rooms/" + room + "/moves", newServer);
        }
    }

    @Test
    @DisplayName("Nginx 전환과 이전 worker 배출 및 이전 JVM 종료 후에도 시간패와 재대결 기록을 저장한다")
    void continuesAfterNginxCutoverAndOldShutdown() throws Exception {
        // Given
        Player host = member("가온", "nginx-stop-host"), guest = member("해솔", "nginx-stop-guest");
        try (Nginx proxy = Nginx.start(oldServer, newServer, logs)) {
            long room = startRoom(proxy, host, guest);
            long record = recordId(room, 1);
            long blackId = snapshot(proxy, host, room).getLong("data.blackMemberId");
            Player black = blackId == host.id() ? host : guest;
            Player white = blackId == host.id() ? guest : host;
            proxy.request(black).body(moveBody(0, 0, 0))
                    .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200)
                    .header("X-Gomoku-Test-Upstream", endsWith(":" + oldServer.port));

            // When: follow the deployment order, draining Nginx before stopping the previous app.
            proxy.switchTo(newServer, "new");
            proxy.awaitDrained();
            assertTrue(oldServer.process.isAlive());
            oldServer.close();
            assertFalse(oldServer.process.isAlive());
            assertEquals(1, snapshot(proxy, host, room).getInt("data.ply"));
            proxy.request(white).body(moveBody(1, 0, 1))
                    .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200)
                    .header("X-Gomoku-Test-Upstream", endsWith(":" + newServer.port));
            jdbc.update("update gomoku_room set turn_deadline=? where id=?", LocalDateTime.now(ZONE).minusSeconds(1), room);

            // Then
            await(() -> completed(room), "The new server must record a timeout after the Nginx cutover");
            assertRecord(room, 1, record, "TIMEOUT", white.id(), 2);
            assertHistory(proxy, host, 1);
            assertHistory(proxy, guest, 1);
            start(proxy, host, guest, room, 2);
            proxy.request(host).body(Map.of("gameNumber", 2))
                    .post(ROOT + "/rooms/" + room + "/resign").then().statusCode(200)
                    .header("X-Gomoku-Test-Upstream", endsWith(":" + newServer.port));
            assertRecord(room, 2, recordId(room, 2), "RESIGN", guest.id(), 0);
            assertHistory(proxy, host, 2);
            assertHistory(proxy, guest, 2);
            proxy.request(host).get(ROOT + "/ranking").then().statusCode(200)
                    .body("data.me.total", equalTo(2));
            proxy.assertAccess("POST", ROOT + "/rooms/" + room + "/start", oldServer);
            proxy.assertAccess("POST", ROOT + "/rooms/" + room + "/resign", newServer);
        }
    }

    private static Map<String, Object> moveBody(int ply, int x, int y) {
        return Map.of("gameNumber", 1, "expectedPly", ply, "x", x, "y", y, "requestId", UUID.randomUUID());
    }

    private static Player member(String name, String github) {
        long id = jdbc.queryForObject("""
                insert into member (crew_name, generation, github_id, member_type, course, created_at, updated_at)
                values (?, 23, ?, 'CREW', 'BACKEND', localtimestamp, localtimestamp) returning id
                """, Long.class, name, github);
        return new Player(id, TOKENS.issue(id).value());
    }

    private static long startRoom(Endpoint server, Player host, Player guest) {
        long room = server.request(host).body(Map.of("visibility", "PUBLIC", "rule", "FREESTYLE"))
                .post(ROOT + "/rooms").then().statusCode(201).extract().jsonPath().getLong("data.roomId");
        server.request(guest).body(Map.of()).post(ROOT + "/rooms/" + room + "/join").then().statusCode(200);
        start(server, host, guest, room, 1);
        return room;
    }

    private static void start(Endpoint server, Player host, Player guest, long room, int number) {
        for (Player player : new Player[] {host, guest}) {
            server.request(player).body(Map.of("ready", true, "gameNumber", number))
                    .put(ROOT + "/rooms/" + room + "/ready").then().statusCode(200);
        }
        server.request(host).body(Map.of("gameNumber", number))
                .post(ROOT + "/rooms/" + room + "/start").then().statusCode(200);
    }

    private static JsonPath snapshot(Endpoint server, Player player, long room) {
        return server.request(player).get(ROOT + "/rooms/" + room).then().statusCode(200).extract().jsonPath();
    }

    private static long recordId(long room, int number) {
        return jdbc.queryForObject("select id from gomoku_game where room_id=? and game_number=?", Long.class, room, number);
    }

    private static boolean completed(long room) {
        return jdbc.queryForObject("select count(*) from gomoku_game where room_id=? and ended_at is not null", Integer.class, room) == 1;
    }

    private static void assertRecord(long room, int number, long record, String reason, long winner, int ply) {
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from gomoku_game where room_id=? and game_number=?
                    and id=? and end_reason=? and winner_member_id=? and ply=? and ended_at is not null
                """, Integer.class, room, number, record, reason, winner, ply));
        assertEquals(1, jdbc.queryForObject("select count(*) from gomoku_game where room_id=? and game_number=?", Integer.class, room, number));
    }

    private static void assertHistory(Endpoint server, Player player, int total) {
        server.request(player).get(ROOT + "/history/me").then().statusCode(200)
                .body("data.items", hasSize(total));
        server.request(player).get(ROOT + "/history/me/summary").then().statusCode(200)
                .body("data.total", equalTo(total));
    }

    private static void await(BooleanSupplier condition, String message) throws InterruptedException {
        await(condition, message, Duration.ofSeconds(15));
    }

    private static void await(BooleanSupplier condition, String message, Duration timeout) throws InterruptedException {
        long limit = System.nanoTime() + timeout.toNanos();
        while (!condition.getAsBoolean()) {
            assertTrue(System.nanoTime() < limit, message);
            Thread.sleep(50);
        }
    }

    private record Player(long id, String token) {}

    @Test
    @DisplayName("두 서버와 Nginx 전환에서도 채팅 알림, 재접속과 중복 요청을 복구하고 종료 시 삭제한다")
    void recoversChatAcrossServersAndProxyReload() throws Exception {
        // Given
        Player host = member("가온", "chat-cutover-host"), guest = member("해솔", "chat-cutover-guest");
        try (Nginx proxy = Nginx.start(oldServer, newServer, logs)) {
            long room = startRoom(proxy, host, guest);
            String path = ROOT + "/rooms/" + room + "/chat/messages";
            String participation = oldServer.request(host).get(path).then().statusCode(200)
                    .extract().jsonPath().getString("data.participationId");
            String receiver = newServer.request(guest).get(path).then().statusCode(200)
                    .extract().jsonPath().getString("data.participationId");
            var body = Map.of("participationId", participation, "clientMessageId", UUID.randomUUID(), "content", "서버 간 대화");
            long revision = snapshot(proxy, host, room).getLong("data.revision");
            try (SnapshotStream stream = new SnapshotStream(proxy, guest, room, oldServer.port)) {
                stream.awaitPly(0);

                // When
                newServer.request(host).body(body).post(path).then().statusCode(201);
                oldServer.request(host).body(body).post(path).then().statusCode(200);

                // Then
                var event = stream.awaitChat("1");
                assertEquals(receiver, event.getString("participationId"));
                assertFalse(event.getMap("").containsKey("content"));
                assertEquals(revision, snapshot(oldServer, host, room).getLong("data.revision"));
                proxy.switchTo(newServer, "new");
                proxy.request(guest).queryParam("afterSequence", "0").get(path).then().statusCode(200)
                        .body("data.items", hasSize(1)).body("data.items[0].content", equalTo("서버 간 대화"));
                oldServer.request(host).body(Map.of("participationId", participation,
                        "clientMessageId", UUID.randomUUID(), "content", "전환 중 대화"))
                        .post(path).then().statusCode(201);
                stream.awaitChat("2");
            }
            try (SnapshotStream reconnected = new SnapshotStream(proxy, guest, room, newServer.port)) {
                assertEquals(receiver, reconnected.awaitChat("2").getString("participationId"));
                proxy.request(guest).queryParam("afterSequence", "1").get(path).then().statusCode(200)
                        .body("data.items", hasSize(1)).body("data.items[0].sequence", equalTo("2"));
            }
            proxy.request(host).post(ROOT + "/rooms/" + room + "/leave").then().statusCode(200);
            assertEquals(0, jdbc.queryForObject("select count(*) from gomoku_chat_message where room_id=?", Integer.class, room));
        }
    }

    @Test
    @DisplayName("두 JVM의 관전자를 회원별로 집계하고 서버 종료와 lease 만료 후에도 채팅을 복구한다")
    void countsObserversAndRecoversChatAcrossTwoServers() throws Exception {
        // Given
        Player host = member("가온", "observe-host"), guest = member("해솔", "observe-guest");
        Player observer = member("관객", "observe-first"), other = member("구경", "observe-other");
        long room = startRoom(oldServer, host, guest);
        jdbc.update("update gomoku_room set turn_deadline=? where id=?", LocalDateTime.now(ZONE).plusMinutes(5), room);
        String path = ROOT + "/rooms/" + room;
        String chatPath = path + "/chat/messages";
        String hostParticipation = oldServer.request(host).get(chatPath).then().statusCode(200)
                .extract().jsonPath().getString("data.participationId");
        oldServer.request(host).body(Map.of("participationId", hostParticipation,
                "clientMessageId", UUID.randomUUID(), "content", "입장 전"))
                .post(chatPath).then().statusCode(201);
        UUID firstRequest = UUID.randomUUID();
        String first = oldServer.request(observer).body(Map.of("requestId", firstRequest))
                .post(path + "/observations").then().statusCode(201).extract().jsonPath().getString("data.participationId");
        String second = newServer.request(observer).body(Map.of("requestId", UUID.randomUUID()))
                .post(path + "/observations").then().statusCode(201).extract().jsonPath().getString("data.participationId");
        String third = oldServer.request(other).body(Map.of("requestId", UUID.randomUUID()))
                .post(path + "/observations").then().statusCode(201).extract().jsonPath().getString("data.participationId");
        try (SnapshotStream firstStream = new SnapshotStream(oldServer, observer, room, first);
                SnapshotStream secondStream = new SnapshotStream(newServer, observer, room, second);
                SnapshotStream thirdStream = new SnapshotStream(oldServer, other, room, third)) {
            firstStream.awaitPly(0);
            secondStream.awaitPly(0);
            thirdStream.awaitPly(0);

            // When / Then
            for (Server server : new Server[] {oldServer, newServer})
                server.anonymous().queryParam("view", "summary").get(ROOT + "/rooms")
                        .then().statusCode(200).body("data.items[0].spectatorCount", equalTo(2));
            newServer.request(observer).body(Map.of("requestId", firstRequest)).post(path + "/observations")
                    .then().statusCode(200).body("data.participationId", equalTo(first));
            newServer.request(observer).queryParam("participationId", first).queryParam("afterSequence", "0")
                    .get(chatPath).then().body("data.items", hasSize(0));
            newServer.request(host).body(Map.of("participationId", hostParticipation,
                    "clientMessageId", UUID.randomUUID(), "content", "입장 후"))
                    .post(chatPath).then().statusCode(201);
            assertEquals(second, secondStream.awaitChat("2").getString("participationId"));
            var message = Map.of("participationId", second, "clientMessageId", UUID.randomUUID(), "content", "함께 봐요");
            oldServer.request(observer).body(message).post(chatPath).then().statusCode(201)
                    .body("data.senderRole", equalTo("SPECTATOR"));
            newServer.request(observer).body(message).post(chatPath).then().statusCode(200);
            thirdStream.awaitChat("3");
            newServer.request(observer).delete(path + "/observations/" + first).then().statusCode(204);
            newServer.anonymous().queryParam("view", "summary").get(ROOT + "/rooms")
                    .then().statusCode(200).body("data.items[0].spectatorCount", equalTo(2));
            LocalDateTime initialLease = jdbc.queryForObject("""
                    select max(c.expires_at) from gomoku_observer_connection c
                    join gomoku_observation o on o.id=c.observation_id where o.participation_id=?
                    """, LocalDateTime.class, UUID.fromString(second));
            await(() -> jdbc.queryForObject("""
                    select max(c.expires_at) from gomoku_observer_connection c
                    join gomoku_observation o on o.id=c.observation_id where o.participation_id=?
                    """, LocalDateTime.class, UUID.fromString(second)).isAfter(initialLease),
                    "An active observer connection must renew its lease", Duration.ofSeconds(20));

            // When: the old JVM cannot clean up its leases; move its deadline past the expiry boundary.
            oldServer.process.destroyForcibly().waitFor(10, TimeUnit.SECONDS);
            newServer.anonymous().queryParam("view", "summary").get(ROOT + "/rooms")
                    .then().statusCode(200).body("data.items[0].spectatorCount", equalTo(2));
            jdbc.update("""
                    update gomoku_observer_connection set expires_at=? where observation_id in
                    (select id from gomoku_observation where participation_id=?)
                    """, LocalDateTime.now(ZONE).minusSeconds(1), UUID.fromString(third));

            // Then
            newServer.anonymous().queryParam("view", "summary").get(ROOT + "/rooms")
                    .then().statusCode(200).body("data.items[0].spectatorCount", equalTo(1));
            newServer.request(observer).queryParam("participationId", second).queryParam("afterSequence", "0")
                    .get(chatPath).then().statusCode(200).body("data.items", hasSize(2));
            newServer.request(observer).delete(path + "/observations/" + second).then().statusCode(204);
            newServer.anonymous().queryParam("view", "summary").get(ROOT + "/rooms")
                    .then().statusCode(200).body("data.items[0].spectatorCount", equalTo(0));
        }
    }

    private interface Endpoint {
        RequestSpecification request(Player player);
    }

    private static final class Server implements Endpoint, AutoCloseable {
        private final Process process;
        private final int port;

        private Server(Process process, int port) {
            this.process = process;
            this.port = port;
        }

        private static Server start(String name, Path log) throws Exception {
            Process process = new ProcessBuilder(
                    Path.of(System.getProperty("java.home"), "bin", "java").toString(), "-Xmx384m",
                    "-cp", System.getProperty("gomoku.cutover.classpath"), "com.project.jarihana.JarihanaApplication",
                    "--server.port=0", "--spring.datasource.url=" + DATABASE.getJdbcUrl(),
                    "--spring.datasource.username=" + DATABASE.getUsername(),
                    "--spring.datasource.password=" + DATABASE.getPassword(),
                    "--spring.datasource.hikari.data-source-properties.ApplicationName=" + name,
                    "--gomoku.expiry.enabled=true", "--gomoku.chat.enabled=true",
                    "--chat.listener.enabled=false", "--jarihana.push.enabled=false")
                    .redirectErrorStream(true).redirectOutput(log.toFile()).start();
            try {
                Pattern started = Pattern.compile("Tomcat started on port (\\d+)");
                int[] port = {0};
                await(() -> {
                    assertTrue(process.isAlive(), "Server exited during startup; inspect " + log);
                    try {
                        var match = started.matcher(Files.readString(log));
                        if (!match.find()) return false;
                        port[0] = Integer.parseInt(match.group(1));
                        return true;
                    } catch (IOException exception) {
                        throw new UncheckedIOException(exception);
                    }
                }, "Server did not start; inspect " + log, Duration.ofSeconds(45));
                Server server = new Server(process, port[0]);
                server.anonymous().get("/groups?size=1").then().statusCode(200);
                return server;
            } catch (Exception | AssertionError failure) {
                process.destroyForcibly().waitFor(10, TimeUnit.SECONDS);
                throw failure;
            }
        }

        private RequestSpecification anonymous() {
            return given().baseUri("http://127.0.0.1").port(port).basePath("/api");
        }

        @Override
        public RequestSpecification request(Player player) {
            String csrf = anonymous().get("/groups?size=1").cookie("XSRF-TOKEN");
            return anonymous().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                    .header("X-XSRF-TOKEN", csrf).cookie("accessToken", player.token());
        }

        @Override
        public void close() throws InterruptedException {
            if (!process.isAlive()) return;
            process.destroy();
            if (!process.waitFor(20, TimeUnit.SECONDS)) {
                process.destroyForcibly().waitFor(10, TimeUnit.SECONDS);
                throw new AssertionError("Application did not stop gracefully");
            }
        }
    }

    private static final class Nginx implements Endpoint, AutoCloseable {
        private static final String CURRENT = "/etc/nginx/deploy/current.conf";
        private static final String CANDIDATE = "/etc/nginx/deploy/candidate.conf";
        private final GenericContainer<?> container;
        private final Path directory;
        private final String masterPid;
        private Set<String> previousWorkers = Set.of();

        private Nginx(GenericContainer<?> container, Path directory) throws Exception {
            this.container = container;
            this.directory = directory;
            masterPid = container.execInContainer("cat", "/var/run/nginx.pid").getStdout().strip();
        }

        private static Nginx start(Server old, Server candidate, Path directory) throws Exception {
            Testcontainers.exposeHostPorts(old.port, candidate.port);
            Path config = writeConfig(directory, old, "old");
            GenericContainer<?> container = new GenericContainer<>(
                    "nginx:1.30.5-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94")
                    .withExposedPorts(8080, 8082)
                    .withCopyFileToContainer(MountableFile.forHostPath(config), CURRENT)
                    .withCommand("nginx", "-c", CURRENT, "-g", "daemon off;");
            try {
                container.start();
                Nginx proxy = new Nginx(container, directory);
                proxy.awaitRoute(old, "old");
                System.out.printf("nginx container=%s apiPort=%d oldUpstream=%d newUpstream=%d%n",
                        container.getContainerId(), container.getMappedPort(8080), old.port, candidate.port);
                return proxy;
            } catch (Exception | AssertionError failure) {
                container.close();
                throw failure;
            }
        }

        private static Path writeConfig(Path directory, Server server, String slot) throws IOException {
            String template = Files.readString(Path.of("../infra/blue-green-deploy/nginx/nginx.conf.template"));
            String config = template.replace("@UPSTREAM@", "host.testcontainers.internal:" + server.port)
                    .replace("@SLOT@", slot)
                    // Observe the actual upstream without changing the production proxy behavior.
                    .replace("location /api/ {", "location /api/ {\n            add_header X-Gomoku-Test-Upstream $upstream_addr always;");
            Path path = directory.resolve("nginx-" + slot + ".conf");
            Files.writeString(path, config);
            return path;
        }

        private void switchTo(Server server, String slot) throws Exception {
            previousWorkers = workerIds();
            assertFalse(previousWorkers.isEmpty());
            Path config = writeConfig(directory, server, slot);
            container.copyFileToContainer(MountableFile.forHostPath(config), CANDIDATE);
            execute("nginx", "-t", "-c", CANDIDATE);
            execute("mv", CANDIDATE, CURRENT);
            execute("nginx", "-s", "reload", "-c", CURRENT);
            awaitRoute(server, slot);
            assertEquals(masterPid, container.execInContainer("cat", "/var/run/nginx.pid").getStdout().strip());
            assertTrue(container.getLogs().contains("reconfiguring"), "The existing Nginx master must reload its configuration");
            System.out.printf("nginx reload slot=%s upstreamPort=%d masterPid=%s previousWorkers=%s%n",
                    slot, server.port, masterPid, previousWorkers);
        }

        private void execute(String... command) throws Exception {
            var result = container.execInContainer(command);
            assertEquals(0, result.getExitCode(), result::getStderr);
        }

        private void awaitRoute(Server server, String slot) throws InterruptedException {
            AtomicInteger consecutive = new AtomicInteger();
            await(() -> {
                var response = given().baseUri("http://" + container.getHost()).port(container.getMappedPort(8082))
                        .header("Connection", "close").get("/__deployment");
                boolean routed = response.statusCode() == 200 && slot.equals(response.header("X-Jarihana-Slot"))
                        && ("host.testcontainers.internal:" + server.port).equals(response.header("X-Jarihana-Target"))
                        && response.header("X-Jarihana-Upstream").endsWith(":" + server.port);
                if (!routed) consecutive.set(0);
                return routed && consecutive.incrementAndGet() >= 3;
            }, "Nginx must send three consecutive probes to the selected upstream");
        }

        private Set<String> workerIds() {
            try {
                var result = container.execInContainer("sh", "-c", """
                        for entry in /proc/[0-9]*; do
                          command=$(tr '\\000' ' ' < "$entry/cmdline" 2>/dev/null) || continue
                          case "$command" in
                            "nginx: worker process"*) awk '{print $1 ":" $22}' "$entry/stat" 2>/dev/null;;
                          esac
                        done
                        """);
                assertEquals(0, result.getExitCode(), result::getStderr);
                String output = result.getStdout().strip();
                return output.isEmpty() ? Set.of() : Set.copyOf(Arrays.asList(output.split("\\R")));
            } catch (IOException exception) {
                throw new UncheckedIOException(exception);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(exception);
            }
        }

        private void awaitDrained() throws InterruptedException {
            await(() -> Collections.disjoint(previousWorkers, workerIds()), "Previous Nginx workers must drain before the old JVM stops");
        }

        private RequestSpecification anonymous() {
            return given().baseUri("http://" + container.getHost()).port(container.getMappedPort(8080))
                    .basePath("/api").header("Connection", "close");
        }

        @Override
        public RequestSpecification request(Player player) {
            String csrf = anonymous().get("/groups?size=1").cookie("XSRF-TOKEN");
            return anonymous().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                    .header("X-XSRF-TOKEN", csrf).cookie("accessToken", player.token());
        }

        private void assertAccess(String method, String path, Server server) throws InterruptedException {
            String pattern = "(?m)^.* " + method + " /api" + Pattern.quote(path)
                    + " 200 upstream=[^ ]*:" + server.port + " upstream_status=200 .*$";
            Pattern expected = Pattern.compile(pattern);
            // A response can reach the client before Nginx finishes and logs the request.
            await(() -> expected.matcher(container.getLogs()).find(),
                    "Nginx access log must confirm " + method + " " + path + " reached port " + server.port);
        }

        @Override
        public void close() throws IOException {
            try {
                Files.writeString(directory.resolve("nginx.log"), container.getLogs());
            } finally {
                container.close();
            }
        }
    }

    private static final class SnapshotStream implements AutoCloseable {
        private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        private final InputStream input;
        private final Thread reader;
        private final BlockingQueue<JsonPath> snapshots = new LinkedBlockingQueue<>();
        private final BlockingQueue<JsonPath> chatChanges = new LinkedBlockingQueue<>();
        private volatile IOException readFailure;

        private SnapshotStream(Nginx proxy, Player player, long room, int expectedUpstream) throws Exception {
            this(URI.create("http://" + proxy.container.getHost() + ":" + proxy.container.getMappedPort(8080)
                    + "/api" + ROOT + "/rooms/" + room + "/events"), player, expectedUpstream);
        }

        private SnapshotStream(Server server, Player player, long room, String participationId) throws Exception {
            this(URI.create("http://127.0.0.1:" + server.port + "/api" + ROOT + "/rooms/" + room
                    + "/events?participationId=" + participationId), player, null);
        }

        private SnapshotStream(URI uri, Player player, Integer expectedUpstream) throws Exception {
            HttpRequest request = HttpRequest.newBuilder().uri(uri)
                    .header("Accept", "text/event-stream").header("Cookie", "accessToken=" + player.token()).build();
            HttpResponse<InputStream> response = client.sendAsync(request, HttpResponse.BodyHandlers.ofInputStream())
                    .get(10, TimeUnit.SECONDS);
            assertEquals(200, response.statusCode());
            if (expectedUpstream != null) assertTrue(response.headers().firstValue("X-Gomoku-Test-Upstream").orElseThrow().endsWith(":" + expectedUpstream));
            input = response.body();
            reader = Thread.ofVirtual().start(() -> {
                try (var lines = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                    String line;
                    String event = "";
                    while ((line = lines.readLine()) != null) {
                        if (line.startsWith("event:")) event = line.substring(6).strip();
                        else if (line.startsWith("data:")) {
                            var data = new JsonPath(line.substring(5).stripLeading());
                            if (event.equals("snapshot")) snapshots.add(data);
                            else if (event.equals("chat_changed")) chatChanges.add(data);
                        } else if (line.isEmpty()) event = "";
                    }
                } catch (IOException exception) {
                    readFailure = exception;
                }
            });
        }

        private JsonPath awaitPly(int ply) throws InterruptedException {
            long limit = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            while (System.nanoTime() < limit) {
                JsonPath snapshot = snapshots.poll(100, TimeUnit.MILLISECONDS);
                if (snapshot != null && snapshot.getInt("ply") == ply) return snapshot;
            }
            throw new AssertionError("The original proxied SSE connection did not receive ply " + ply, readFailure);
        }

        private JsonPath awaitChat(String sequence) throws InterruptedException {
            long limit = System.nanoTime() + Duration.ofSeconds(10).toNanos();
            while (System.nanoTime() < limit) {
                JsonPath event = chatChanges.poll(100, TimeUnit.MILLISECONDS);
                if (event != null && event.getString("latestSequence").equals(sequence)) return event;
            }
            throw new AssertionError("The proxied SSE did not receive chat sequence " + sequence, readFailure);
        }

        @Override
        public void close() throws Exception {
            input.close();
            client.shutdownNow();
            reader.join(2000);
        }
    }
}

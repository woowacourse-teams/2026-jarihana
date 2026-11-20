package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Future;
import java.util.concurrent.Callable;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "gomoku.chat.enabled=true")
class GomokuChatAcceptanceTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/gomoku/rooms";
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("새 참가자는 입장 이후만 보고 남아 있는 참가자는 이전 대화를 유지한다")
    void restrictsHistoryToCurrentParticipation() {
        // Given
        String host = member("방장"), guest = member("첫손님"), next = member("새손님");
        long room = create(host);
        String hostSession = session(host, room);
        send(host, room, hostSession, UUID.randomUUID(), "혼자 쓴 대화").then().statusCode(201);
        join(guest, room);
        String guestSession = session(guest, room);
        send(guest, room, guestSession, UUID.randomUUID(), "첫 대화").then().statusCode(201);

        // When
        request(guest).post(ROOT + "/" + room + "/leave").then().statusCode(200);
        join(next, room);
        String nextSession = session(next, room);

        // Then
        request(next).get(path(room)).then().statusCode(200).body("data.items", hasSize(0));
        request(host).get(path(room)).then().statusCode(200).body("data.items", hasSize(2));
        request(guest).get(path(room)).then().statusCode(403);
        send(next, room, nextSession, UUID.randomUUID(), "새 대화").then().statusCode(201);
        request(next).get(path(room)).then().body("data.items", hasSize(1))
                .body("data.items[0].content", equalTo("새 대화"));
        request(next).queryParam("afterSequence", "0").get(path(room)).then()
                .body("data.items", hasSize(1));

        // When: the same member returns with a new participation.
        request(next).post(ROOT + "/" + room + "/leave").then().statusCode(200);
        join(guest, room);
        String returned = session(guest, room);

        // Then
        assertNotEquals(guestSession, returned);
        request(guest).get(path(room)).then().body("data.items", hasSize(0));
        request(guest).queryParam("participationId", guestSession).get(path(room)).then().statusCode(409);
        send(guest, room, guestSession, UUID.randomUUID(), "이전 회차 요청").then().statusCode(409);
    }

    @Test
    @DisplayName("메시지는 원문과 순번을 보존하고 동일 키 재시도는 중복 저장하지 않는다")
    void deduplicatesOriginalContentWithoutChangingBoard() {
        // Given
        String host = member("방장");
        long room = create(host);
        String session = session(host, room);
        UUID key = UUID.randomUUID();
        long revision = jdbc.queryForObject("select revision from gomoku_room where id=?", Long.class, room);

        // When / Then
        send(host, room, session, key, "  안녕\n상대!  ").then().statusCode(201)
                .body("data.sequence", equalTo("1")).body("data.content", equalTo("  안녕\n상대!  "));
        send(host, room, session, key, "  안녕\n상대!  ").then().statusCode(200)
                .body("data.sequence", equalTo("1"));
        send(host, room, session, key, "다른 내용").then().statusCode(409);
        send(host, room, session, UUID.randomUUID(), " \n ").then().statusCode(400);
        send(host, room, session, UUID.randomUUID(), "가".repeat(2001)).then().statusCode(400);
        send(host, room, session, UUID.randomUUID(), "😀".repeat(1001)).then().statusCode(400);
        request(host).get(path(room)).then().statusCode(200).body("data.items", hasSize(1));
        assertEquals(revision, jdbc.queryForObject("select revision from gomoku_room where id=?", Long.class, room));
        assertEquals(1L, jdbc.queryForObject("select count(*) from gomoku_chat_message where room_id=?", Long.class, room));
    }

    @Test
    @DisplayName("대화 이력은 순번으로 페이지 복구하고 방 종료와 함께 물리 삭제한다")
    void recoversPagesAndPurgesOnClose() {
        // Given
        String host = member("방장");
        long room = create(host);
        String session = session(host, room);
        for (int i = 1; i <= 5; i++)
            send(host, room, session, UUID.randomUUID(), "대화 " + i).then().statusCode(201);

        // When / Then
        request(host).queryParam("size", 2).get(path(room)).then().statusCode(200)
                .body("data.items[0].sequence", equalTo("4")).body("data.hasNext", equalTo(true))
                .body("data.nextCursor", equalTo("4"));
        request(host).queryParam("afterSequence", "1").queryParam("size", 2).get(path(room)).then()
                .body("data.items[0].sequence", equalTo("2")).body("data.nextCursor", equalTo("3"));
        request(host).queryParam("beforeSequence", "4").queryParam("size", 2).get(path(room)).then()
                .body("data.items[0].sequence", equalTo("2"));
        request(host).queryParam("beforeSequence", "2").queryParam("afterSequence", "1")
                .get(path(room)).then().statusCode(400);
        request(host).post(ROOT + "/" + room + "/leave").then().statusCode(200);
        assertEquals(0L, jdbc.queryForObject("select count(*) from gomoku_chat_message where room_id=?", Long.class, room));
        request(host).get(path(room)).then().statusCode(403);
        send(host, room, session, UUID.randomUUID(), "종료 후 대화").then().statusCode(403);
    }

    @Test
    @DisplayName("동시 전송과 중복 요청은 방 잠금 아래 연속 순번 하나씩만 저장한다")
    void serializesConcurrentMessagesAndRetries() throws Exception {
        // Given
        String host = member("방장");
        long room = create(host);
        String participation = session(host, room);
        UUID duplicate = UUID.randomUUID();
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Integer>> results = new ArrayList<>();

        // When
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < 8; i++) {
                UUID key = i < 2 ? duplicate : UUID.randomUUID();
                results.add(executor.submit(() -> {
                    assertTrue(start.await(10, TimeUnit.SECONDS));
                    return send(host, room, participation, key, "동시 전송").statusCode();
                }));
            }
            start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var result : results) statuses.add(result.get(20, TimeUnit.SECONDS));

            // Then
            assertEquals(7L, statuses.stream().filter(value -> value == 201).count());
            assertEquals(1L, statuses.stream().filter(value -> value == 200).count());
        }
        assertEquals(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L), jdbc.queryForList(
                "select sequence from gomoku_chat_message where room_id=? order by sequence", Long.class, room));
    }

    @Test
    @DisplayName("채팅은 제한 시간을 바꾸지 않고 결과와 재대결에도 같은 대화를 유지한다")
    void preservesDeadlineAndHistoryAcrossRematch() {
        // Given
        String host = member("방장"), guest = member("손님");
        long room = create(host);
        join(guest, room);
        for (String player : List.of(host, guest)) request(player).body(Map.of("ready", true, "gameNumber", 1))
                .put(ROOT + "/" + room + "/ready").then().statusCode(200);
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/" + room + "/start").then().statusCode(200);
        var before = request(host).get(ROOT + "/" + room).jsonPath();
        String participation = session(host, room);

        // When / Then
        send(host, room, participation, UUID.randomUUID(), "대국 중 대화").then().statusCode(201);
        var after = request(host).get(ROOT + "/" + room).jsonPath();
        assertEquals(before.getLong("data.turnDeadline"), after.getLong("data.turnDeadline"));
        assertEquals(before.getLong("data.revision"), after.getLong("data.revision"));
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/" + room + "/resign").then().statusCode(200);
        send(host, room, participation, UUID.randomUUID(), "결과 대화").then().statusCode(201);
        for (String player : List.of(host, guest)) request(player).body(Map.of("ready", true, "gameNumber", 2))
                .put(ROOT + "/" + room + "/ready").then().statusCode(200);
        request(host).body(Map.of("gameNumber", 2)).post(ROOT + "/" + room + "/start").then().statusCode(200);
        assertEquals(participation, session(host, room));
        request(guest).get(path(room)).then().body("data.items", hasSize(2));
    }

    @Test
    @DisplayName("새 메시지만 활동 시각을 갱신하고 만료된 방의 채팅은 종료와 함께 삭제한다")
    void touchesOnlyNewMessagesAndCommitsExpiration() {
        // Given
        String host = member("방장");
        long room = create(host);
        String participation = session(host, room);
        UUID key = UUID.randomUUID();
        send(host, room, participation, key, "원본").then().statusCode(201);
        jdbc.update("update gomoku_room set touched_at=timestamp '2026-08-19 09:58:00' where id=?", room);

        // When / Then
        request(host).get(path(room)).then().statusCode(200);
        send(host, room, participation, key, "원본").then().statusCode(200);
        assertEquals("2026-08-19T09:58", jdbc.queryForObject("select touched_at from gomoku_room where id=?", java.time.LocalDateTime.class, room).toString());
        send(host, room, participation, UUID.randomUUID(), "새 대화").then().statusCode(201);
        assertEquals("2026-08-19T10:00", jdbc.queryForObject("select touched_at from gomoku_room where id=?", java.time.LocalDateTime.class, room).toString());
        jdbc.update("update gomoku_room set touched_at=timestamp '2000-01-01 00:00:00' where id=?", room);
        send(host, room, participation, UUID.randomUUID(), "만료 후").then().statusCode(409);
        assertEquals("CLOSED", jdbc.queryForObject("select status from gomoku_room where id=?", String.class, room));
        assertEquals(0L, jdbc.queryForObject("select count(*) from gomoku_chat_message where room_id=?", Long.class, room));
    }

    @Test
    @DisplayName("동시 퇴장과 전송은 자격을 회수하고 방 종료와 전송은 본문을 남기지 않는다")
    void serializesLeaveAndCloseAgainstSend() throws Exception {
        // Given
        String host = member("방장"), guest = member("손님");
        long room = create(host);
        join(guest, room);
        String participation = session(guest, room);

        // When
        var statuses = race(
                () -> send(guest, room, participation, UUID.randomUUID(), "퇴장과 동시 전송").statusCode(),
                () -> request(guest).post(ROOT + "/" + room + "/leave").statusCode());

        // Then
        assertTrue(statuses.getFirst() == 201 || statuses.getFirst() == 403);
        assertEquals(200, statuses.getLast());
        request(guest).get(path(room)).then().statusCode(403);
        String owner = session(host, room);

        // When
        statuses = race(
                () -> send(host, room, owner, UUID.randomUUID(), "종료와 동시 전송").statusCode(),
                () -> request(host).post(ROOT + "/" + room + "/leave").statusCode());

        // Then
        assertTrue(statuses.getFirst() == 201 || statuses.getFirst() == 403);
        assertEquals(200, statuses.getLast());
        assertEquals(0L, jdbc.queryForObject("select count(*) from gomoku_chat_message where room_id=?", Long.class, room));
    }

    private List<Integer> race(Callable<Integer> first, Callable<Integer> second) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = executor.submit(() -> { start.await(); return first.call(); });
            var b = executor.submit(() -> { start.await(); return second.call(); });
            start.countDown();
            return List.of(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        }
    }

    private String member(String name) {
        return tokens.issue(members.save(Member.create(name, 23, UUID.randomUUID().toString(), Course.BACKEND)).getId()).value();
    }

    private long create(String token) {
        return request(token).body(Map.of("visibility", "PUBLIC", "rule", "RENJU")).post(ROOT)
                .then().statusCode(201).extract().jsonPath().getLong("data.roomId");
    }

    private void join(String token, long room) {
        request(token).body(Map.of()).post(ROOT + "/" + room + "/join").then().statusCode(200);
    }

    private String session(String token, long room) {
        return request(token).get(path(room)).then().statusCode(200).extract().jsonPath().getString("data.participationId");
    }

    private io.restassured.response.Response send(String token, long room, String session, UUID key, String content) {
        return request(token).body(Map.of("participationId", session, "clientMessageId", key, "content", content)).post(path(room));
    }

    private String path(long room) {
        return ROOT + "/" + room + "/chat/messages";
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf).cookie("accessToken", token);
    }
}

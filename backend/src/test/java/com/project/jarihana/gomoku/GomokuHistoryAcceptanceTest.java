package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.gomoku.command.service.GomokuCommandService;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

// A leftover value from the removed switch must not disable history collection.
@TestPropertySource(properties = "gomoku.history.enabled=false")
class GomokuHistoryAcceptanceTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/gomoku";
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;
    @Autowired GomokuCommandService commands;

    @Test
    @DisplayName("무승부도 전체 대국과 승률의 분모에 포함한다")
    void includesDrawsInWinRate() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        long black = request(host).get(ROOT + "/rooms/" + room).jsonPath().getLong("data.blackMemberId");
        Player actor = black == host.id() ? host : guest;
        StringBuilder board = new StringBuilder();
        for (int y = 0; y < 15; y++) {
            for (int x = 0; x < 15; x++) board.append((x + 2 * y) % 4 < 2 ? '1' : '2');
        }
        board.setCharAt(0, '0');
        jdbc.update("update gomoku_room set board=?, ply=224 where id=?", board.toString(), room);
        // When
        request(actor).body(Map.of("gameNumber", 1, "expectedPly", 224, "x", 0, "y", 0, "requestId", UUID.randomUUID()))
                .post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);
        // Then
        summary(host).body("data.total", equalTo(1)).body("data.draws", equalTo(1))
                .body("data.winRate", equalTo(0.0f));
        start(host, guest, room, 2);
        resign(guest, room, 2);
        summary(host).body("data.total", equalTo(2)).body("data.wins", equalTo(1))
                .body("data.draws", equalTo(1)).body("data.winRate", equalTo(50.0f));
    }

    @Test
    @DisplayName("기록 시작 전의 판과 대기 취소는 소급 집계하지 않는다")
    void ignoresUntrackedGamesAndWaitingCancellation() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        jdbc.update("delete from gomoku_game where room_id=?", room);
        // When
        resign(host, room, 1);
        request(host).post(ROOT + "/rooms/" + room + "/leave").then().statusCode(200);
        long waiting = request(host).body(Map.of("visibility", "PUBLIC", "rule", "RENJU"))
                .post(ROOT + "/rooms").jsonPath().getLong("data.roomId");
        request(host).post(ROOT + "/rooms/" + waiting + "/leave").then().statusCode(200);
        // Then
        summary(host).body("data.total", equalTo(0));
    }

    @Test
    @DisplayName("여러 만료 처리와 재시작에도 시간패를 한 번만 저장한다")
    void schedulerFinalizesTimeoutOnce() throws Exception {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        jdbc.update("update gomoku_room set turn_deadline=timestamp '2026-08-19 09:59:00' where id=?", room);
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            CountDownLatch gate = new CountDownLatch(1);
            var first = executor.submit(() -> { gate.await(); commands.expire(room); return null; });
            var second = executor.submit(() -> { gate.await(); commands.expire(room); return null; });
            gate.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
        }
        start(host, guest, room, 2);
        // Then
        summary(host).body("data.total", equalTo(1));
        request(host).get(ROOT + "/history/me").then().statusCode(200)
                .body("data.items[0].endReason", equalTo("TIMEOUT"));
    }

    @Test
    @DisplayName("결과 저장이 실패하면 방의 종료도 롤백한다")
    void rollsBackRoomWhenHistoryCannotBeSaved() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        jdbc.execute("alter table gomoku_game add constraint history_failure_test check (ended_at is null)");
        try {
            // When
            request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + room + "/resign")
                    .then().statusCode(500);
            // Then
            request(host).get(ROOT + "/rooms/" + room).then().statusCode(200)
                    .body("data.status", equalTo("PLAYING")).body("data.endReason", nullValue());
            summary(host).body("data.total", equalTo(0));
        } finally {
            jdbc.execute("alter table gomoku_game drop constraint history_failure_test");
        }
        resign(host, room, 1);
        summary(host).body("data.total", equalTo(1));
    }

    @Test
    @DisplayName("진행 중인 판은 제외하고 기권과 재대결을 각각 보존한다")
    void recordsEachFinishedGameAndKeepsHistoryAfterLeaving() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        summary(host).body("data.total", equalTo(0)).body("data.winRate", nullValue());
        // When
        resign(host, room, 1);
        start(host, guest, room, 2);
        resign(guest, room, 2);
        request(host).post(ROOT + "/rooms/" + room + "/leave").then().statusCode(200);
        // Then
        summary(host).body("data.total", equalTo(2)).body("data.wins", equalTo(1))
                .body("data.losses", equalTo(1)).body("data.draws", equalTo(0))
                .body("data.winRate", equalTo(50.0f));
        request(host).queryParam("size", 1).get(ROOT + "/history/me").then().statusCode(200)
                .body("data.items[0].opponentName", equalTo("해솔"))
                .body("data.items[0].result", equalTo("WIN"))
                .body("data.items[0].endReason", equalTo("RESIGN"))
                .body("data.hasNext", equalTo(true));
        String cursor = request(host).queryParam("size", 1).get(ROOT + "/history/me")
                .jsonPath().getString("data.nextCursor");
        request(host).queryParam("size", 1).queryParam("cursor", cursor)
                .get(ROOT + "/history/me").then().statusCode(200)
                .body("data.items[0].result", equalTo("LOSE"))
                .body("data.hasNext", equalTo(false)).body("data.nextCursor", nullValue());
        summary(guest).body("data.wins", equalTo(1)).body("data.losses", equalTo(1));
    }

    @Test
    @DisplayName("시간패 409와 진행 중 퇴장에도 결과를 한 번만 저장한다")
    void recordsTimeoutAndLeaveExactlyOnce() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        long black = request(host).get(ROOT + "/rooms/" + room).jsonPath().getLong("data.blackMemberId");
        jdbc.update("update gomoku_room set turn_deadline=timestamp '2026-08-19 09:59:00' where id=?", room);
        // When
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + room + "/resign")
                .then().statusCode(409);
        request(host).post(ROOT + "/rooms/" + room + "/leave").then().statusCode(200);
        request(host).post(ROOT + "/rooms/" + room + "/leave").then().statusCode(200);
        // Then
        summary(host).body("data.total", equalTo(1));
        request(host).get(ROOT + "/history/me").then().statusCode(200)
                .body("data.items", hasSize(1)).body("data.items[0].endReason", equalTo("TIMEOUT"))
                .body("data.items[0].result", equalTo(black == host.id() ? "LOSE" : "WIN"))
                .body("data.items[0].endedAt", equalTo("2026-08-19T09:59:00"));
        long next = startRoom(host, guest);
        request(guest).post(ROOT + "/rooms/" + next + "/leave").then().statusCode(200);
        summary(host).body("data.total", equalTo(2));
    }

    @Test
    @DisplayName("오목 완성 착수의 재시도와 방 만료가 전적을 중복 집계하지 않는다")
    void recordsWinningMoveAndRetryOnce() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        long room = startRoom(host, guest);
        long black = request(host).get(ROOT + "/rooms/" + room).jsonPath().getLong("data.blackMemberId");
        Player actor = black == host.id() ? host : guest;
        String board = "1111" + "0".repeat(11) + "2222" + "0".repeat(206);
        jdbc.update("update gomoku_room set board=?, ply=8 where id=?", board, room);
        var move = Map.of("gameNumber", 1, "expectedPly", 8, "x", 4, "y", 0, "requestId", UUID.randomUUID());
        // When
        request(actor).body(move).post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);
        request(actor).body(move).post(ROOT + "/rooms/" + room + "/moves").then().statusCode(200);
        // Then
        summary(actor).body("data.total", equalTo(1)).body("data.wins", equalTo(1))
                .body("data.winRate", equalTo(100.0f));
        request(actor).get(ROOT + "/history/me").then().statusCode(200)
                .body("data.items[0].endReason", equalTo("FIVE"));
    }

    @Test
    @DisplayName("본인 전적만 조회하고 누적 승수 랭킹과 내 순위를 반환한다")
    void ranksMembersByWinsAndProtectsPrivateHistory() {
        // Given
        Player host = member("가온", "10001"), guest = member("해솔", "10002");
        Player outsider = member("여울", "10003");
        long room = startRoom(host, guest);
        resign(guest, room, 1);
        start(host, guest, room, 2);
        resign(guest, room, 2);
        // When / Then
        summary(outsider).body("data.total", equalTo(0));
        request(outsider).get(ROOT + "/history/me").then().statusCode(200).body("data.items", hasSize(0));
        request(host).queryParam("size", 1).get(ROOT + "/ranking").then().statusCode(200)
                .body("data.items[0].memberId", equalTo((int) host.id()))
                .body("data.items[0].wins", equalTo(2)).body("data.items[0].rank", equalTo(1))
                .body("data.items[0].avatarUrl", equalTo("https://avatars.githubusercontent.com/u/10001"))
                .body("data.me.rank", equalTo(1)).body("data.hasNext", equalTo(true));
        String cursor = request(host).queryParam("size", 1).get(ROOT + "/ranking").jsonPath().getString("data.nextCursor");
        request(guest).queryParam("size", 1).queryParam("cursor", cursor).get(ROOT + "/ranking")
                .then().statusCode(200).body("data.items[0].memberId", equalTo((int) guest.id()))
                .body("data.me.rank", equalTo(2)).body("data.hasNext", equalTo(false));
        request(outsider).get(ROOT + "/ranking").then().statusCode(200).body("data.me", nullValue());
        given().get(ROOT + "/history/me").then().statusCode(401);
        given().get(ROOT + "/history/me/summary").then().statusCode(401);
        given().get(ROOT + "/ranking").then().statusCode(401);
        request(host).queryParam("cursor", "bad").get(ROOT + "/history/me").then().statusCode(400);
        request(host).queryParam("cursor", "bad").get(ROOT + "/ranking").then().statusCode(400);
        request(host).queryParam("size", 101).get(ROOT + "/ranking").then().statusCode(400);
    }

    private io.restassured.response.ValidatableResponse summary(Player player) {
        return request(player).get(ROOT + "/history/me/summary").then().statusCode(200);
    }

    private long startRoom(Player host, Player guest) {
        long room = request(host).body(Map.of("visibility", "PUBLIC", "rule", "FREESTYLE"))
                .post(ROOT + "/rooms").then().statusCode(201).extract().jsonPath().getLong("data.roomId");
        request(guest).body(Map.of()).post(ROOT + "/rooms/" + room + "/join").then().statusCode(200);
        start(host, guest, room, 1);
        return room;
    }

    private void start(Player host, Player guest, long room, int number) {
        for (Player player : new Player[] {host, guest}) {
            request(player).body(Map.of("ready", true, "gameNumber", number))
                    .put(ROOT + "/rooms/" + room + "/ready").then().statusCode(200);
        }
        request(host).body(Map.of("gameNumber", number)).post(ROOT + "/rooms/" + room + "/start")
                .then().statusCode(200);
    }

    private void resign(Player player, long room, int number) {
        request(player).body(Map.of("gameNumber", number)).post(ROOT + "/rooms/" + room + "/resign")
                .then().statusCode(200);
    }

    private Player member(String name, String github) {
        long id = members.save(Member.create(name, 23, github, Course.BACKEND)).getId();
        return new Player(id, tokens.issue(id).value());
    }

    private RequestSpecification request(Player player) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf).cookie(cookies.accessTokenName(), player.token());
    }

    private record Player(long id, String token) {}
}

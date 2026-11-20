package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;

import io.restassured.specification.RequestSpecification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

class GomokuAcceptanceTest extends IntegrationTestSupport {
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;
    private static final String ROOT = "/games/gomoku/rooms";

    @Test
    @DisplayName("기존 목록은 비어 있지 않아도 기존 스냅샷 계약과 대기방 전용 범위를 유지한다")
    void keepsLegacySnapshotContractAndWaitingOnlyScope() {
        // Given
        String waitingHost = member("가을", "legacy-waiting");
        long waitingId = create(waitingHost, "PUBLIC", "RENJU");
        String playingHost = member("가람", "legacy-playing-host");
        String guest = member("겨울", "legacy-playing-guest");
        long playingId = create(playingHost, "PUBLIC", "RENJU");
        request(guest).body(Map.of()).post(ROOT + "/" + playingId + "/join").then().statusCode(200);
        ready(playingHost, playingId, 1);
        ready(guest, playingId, 1);
        start(playingHost, playingId, 1);
        Map<String, Object> snapshot = request(waitingHost).get(ROOT + "/" + waitingId)
                .then().statusCode(200).extract().path("data");
        assertEquals(Set.of(
                "id", "hostMemberId", "hostName", "hostAvatarUrl", "guestMemberId", "guestName",
                "guestAvatarUrl", "visibility", "rule", "status", "hostReady", "guestReady",
                "gameNumber", "blackMemberId", "board", "ply", "lastX", "lastY", "winnerMemberId",
                "endReason", "revision", "serverNow", "turnDeadline"), snapshot.keySet());

        // When
        var page = request(null).queryParam("keyword", "가").queryParam("size", 1).get(ROOT)
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) waitingId))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue())
                .extract().jsonPath();

        // Then
        assertEquals(snapshot, page.getMap("data.items[0]"));
    }

    @Test
    @DisplayName("공개 대기방과 진행 중인 방을 검색과 커서에 함께 포함하고 참가 권한을 유지한다")
    void listsWaitingAndPlayingPublicRooms() {
        // Given
        long waitingId = create(member("가을", "lobby-waiting"), "PUBLIC", "RENJU");
        String host = member("가람", "lobby-playing-host");
        String guest = member("겨울", "lobby-playing-guest");
        long playingId = create(host, "PUBLIC", "RENJU");
        request(guest).body(Map.of()).post(ROOT + "/" + playingId + "/join").then().statusCode(200);
        ready(host, playingId, 1);
        ready(guest, playingId, 1);
        start(host, playingId, 1);
        jdbc.update("update gomoku_room set touched_at=timestamp '2000-01-01 00:00:00' where id=?", playingId);
        long privateId = create(member("가나", "lobby-private"), "PRIVATE", "RENJU");
        jdbc.update("update gomoku_room set status='PLAYING', turn_deadline=timestamp '2099-01-01 00:00:00' where id=?", privateId);
        long finishedId = create(member("가다", "lobby-finished"), "PUBLIC", "RENJU");
        jdbc.update("update gomoku_room set status='FINISHED' where id=?", finishedId);
        long closedId = create(member("가라", "lobby-closed"), "PUBLIC", "RENJU");
        jdbc.update("update gomoku_room set status='CLOSED' where id=?", closedId);
        long timedOutId = create(member("가바", "lobby-timeout"), "PUBLIC", "RENJU");
        jdbc.update("update gomoku_room set status='PLAYING', turn_deadline=timestamp '2000-01-01 00:00:00' where id=?", timedOutId);

        // When
        var page = request(null).queryParam("view", "summary").queryParam("keyword", "가").queryParam("size", 1).get(ROOT)
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) playingId))
                .body("data.items[0].status", equalTo("PLAYING"))
                .body("data.items[0]", not(hasKey("board")))
                .body("data.items[0]", not(hasKey("turnDeadline")))
                .body("data.items[0]", not(hasKey("serverNow")))
                .body("data.items[0]", not(hasKey("hostReady")))
                .body("data.items[0]", not(hasKey("revision")))
                .body("data.hasNext", equalTo(true))
                .extract().jsonPath();

        // Then
        request(null).queryParam("view", "summary").queryParam("keyword", "가").queryParam("size", 1)
                .queryParam("cursor", page.getString("data.nextCursor")).get(ROOT)
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) waitingId))
                .body("data.items[0].status", equalTo("WAITING"))
                .body("data.hasNext", equalTo(false));
        String outsider = member("봄날", "lobby-outsider");
        request(outsider).get(ROOT + "/" + playingId).then().statusCode(403);
        request(outsider).body(Map.of()).post(ROOT + "/" + playingId + "/join").then().statusCode(409);
    }

    @Test
    @DisplayName("요약 목록도 검색과 커서를 검증하고 지원하지 않는 목록 형식을 거부한다")
    void validatesSummaryListAndRejectsUnknownView() {
        // Given / When / Then
        request(null).queryParam("view", "summary").queryParam("keyword", "가".repeat(51))
                .get(ROOT).then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
        request(null).queryParam("view", "summary").queryParam("cursor", "invalid")
                .get(ROOT).then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
        request(null).queryParam("view", "summary").queryParam("size", 0)
                .get(ROOT).then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
        request(null).queryParam("view", "unknown")
                .get(ROOT).then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
    }

    @Test
    @DisplayName("크루 이름 검색을 커서와 함께 적용하고 비공개, 만석, 만료 방을 제외한다")
    void searchesWaitingRoomsBeforePagination() {
        // Given
        String first = member("가람", "search-first");
        String second = member("가을", "search-second");
        long firstId = create(first, "PUBLIC", "RENJU");
        long secondId = create(second, "PUBLIC", "FREESTYLE");
        create(member("겨울", "search-other"), "PUBLIC", "RENJU");
        create(member("가나", "search-private"), "PRIVATE", "RENJU");
        long fullId = create(member("가다", "search-full"), "PUBLIC", "RENJU");
        request(member("손님", "search-guest"))
                .body(Map.of())
                .post(ROOT + "/" + fullId + "/join");
        long expiredId = create(member("가라", "search-expired"), "PUBLIC", "RENJU");
        jdbc.update(
                "update gomoku_room set touched_at=timestamp '2000-01-01 00:00:00' where id=?",
                expiredId);
        // When
        var page = request(null)
                .queryParam("keyword", "가")
                .queryParam("size", 1)
                .get(ROOT)
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) secondId))
                .body("data.hasNext", equalTo(true))
                .extract()
                .jsonPath();
        // Then
        request(null)
                .queryParam("keyword", "가")
                .queryParam("size", 1)
                .queryParam("cursor", page.getString("data.nextCursor"))
                .get(ROOT)
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) firstId))
                .body("data.hasNext", equalTo(false));
        request(null)
                .queryParam("keyword", " 가 ")
                .get(ROOT)
                .then()
                .statusCode(200)
                .body("data.items", hasSize(2));
        request(null)
                .queryParam("keyword", "%")
                .get(ROOT)
                .then()
                .statusCode(200)
                .body("data.items", hasSize(0));
        request(null)
                .queryParam("keyword", " ")
                .get(ROOT)
                .then()
                .statusCode(200)
                .body("data.items", hasSize(3));
        request(null)
                .queryParam("keyword", "가".repeat(51))
                .get(ROOT)
                .then()
                .statusCode(400);
    }


    @Test
    @DisplayName("참가자의 깃허브 프로필 이미지를 조회하고 빈 자리에는 이미지를 반환하지 않는다")
    void includesParticipantGithubAvatars() {
        // Given
        String host = member("가을", "12345");
        String guest = member("겨울", "67890");
        long id = create(host, "PUBLIC", "RENJU");

        // When / Then
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .statusCode(200)
                .body("data.hostAvatarUrl", equalTo("https://avatars.githubusercontent.com/u/12345"))
                .body("data.guestAvatarUrl", nullValue());
        request(null)
                .get(ROOT)
                .then()
                .statusCode(200)
                .body("data.items[0].hostAvatarUrl", equalTo("https://avatars.githubusercontent.com/u/12345"));

        // When
        request(guest).body(Map.of()).post(ROOT + "/" + id + "/join").then().statusCode(200);

        // Then
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .statusCode(200)
                .body("data.hostAvatarUrl", equalTo("https://avatars.githubusercontent.com/u/12345"))
                .body("data.guestAvatarUrl", equalTo("https://avatars.githubusercontent.com/u/67890"));
    }

    @Test
    @DisplayName("공개 방 참가와 준비, 착수, 중복 요청, 기권과 재대국을 처리한다")
    void playsAndRematches() {
        // Given
        String host = member("가을", "host"), guest = member("겨울", "guest");
        long id = create(host, "PUBLIC", "RENJU");
        request(guest).body(Map.of()).post(ROOT + "/" + id + "/join").then().statusCode(200);
        // When
        ready(host, id, 1);
        ready(guest, id, 1);
        start(host, id, 1);
        long black = request(host).get(ROOT + "/" + id).jsonPath().getLong("data.blackMemberId");
        String actor = black == 1 ? host : guest;
        UUID requestId = UUID.randomUUID();
        var move =
                Map.of("gameNumber", 1, "expectedPly", 0, "x", 7, "y", 7, "requestId", requestId);
        request(actor).body(move).post(ROOT + "/" + id + "/moves").then().statusCode(200);
        request(actor).body(move).post(ROOT + "/" + id + "/moves").then().statusCode(200);
        // Then
        request(host).get(ROOT + "/" + id).then().statusCode(200).body("data.ply", equalTo(1));
        String opponent = actor.equals(host) ? guest : host;
        request(opponent)
                .body(Map.of("gameNumber", 1, "expectedPly", 1, "x", 7, "y", 7, "requestId", UUID.randomUUID()))
                .post(ROOT + "/" + id + "/moves")
                .then()
                .statusCode(409)
                .body("error.code", equalTo("GOMOKU_CONFLICT"));
        request(actor)
                .body(
                        Map.of(
                                "gameNumber",
                                1,
                                "expectedPly",
                                1,
                                "x",
                                8,
                                "y",
                                7,
                                "requestId",
                                requestId))
                .post(ROOT + "/" + id + "/moves")
                .then()
                .statusCode(409);
        request(host)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/resign")
                .then()
                .statusCode(200);
        ready(host, id, 2);
        ready(guest, id, 2);
        start(host, id, 2);
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .body("data.gameNumber", equalTo(2))
                .body("data.ply", equalTo(0));
        long nextBlack =
                request(host).get(ROOT + "/" + id).jsonPath().getLong("data.blackMemberId");
        assertEquals(3 - black, nextBlack);
        request(actor).body(move).post(ROOT + "/" + id + "/moves").then().statusCode(409);
    }

    @Test
    @DisplayName("초대 전용 방은 목록에서 숨기고 초대 토큰 없는 입장을 거부한다")
    void protectsPrivateRoom() {
        // Given
        String host = member("가을", "private-host"),
                guest = member("겨울", "private-guest"),
                outsider = member("봄날", "outsider");
        long id = create(host, "PRIVATE", "FREESTYLE");
        // When / Then
        given().get(ROOT).then().statusCode(200).body("data.items", hasSize(0));
        request(guest).get(ROOT + "/" + id).then().statusCode(403);
        request(guest).body(Map.of()).post(ROOT + "/" + id + "/join").then().statusCode(403);
        String token =
                request(host)
                        .post(ROOT + "/" + id + "/invite")
                        .then()
                        .statusCode(200)
                        .extract()
                        .path("data.token");
        given().get("/games/gomoku/invitations/" + token)
                .then()
                .statusCode(200)
                .body("data.id", equalTo((int) id));
        request(guest)
                .body(Map.of("token", token))
                .post(ROOT + "/" + id + "/join")
                .then()
                .statusCode(200);
        request(outsider)
                .body(Map.of("token", token))
                .post(ROOT + "/" + id + "/join")
                .then()
                .statusCode(409);
        request(outsider).get(ROOT + "/" + id + "/events").then().statusCode(403);
    }

    @Test
    @DisplayName("인증과 CSRF를 확인하고 한 회원의 동시 방 참여를 제한한다")
    void protectsCommandsAndSingleSeat() {
        // Given
        String host = member("가을", "single-host");
        // When / Then
        request(null)
                .body(Map.of("visibility", "PUBLIC", "rule", "RENJU"))
                .post(ROOT)
                .then()
                .statusCode(401);
        given().cookie(cookies.accessTokenName(), host)
                .contentType("application/json")
                .body(Map.of("visibility", "PUBLIC", "rule", "RENJU"))
                .post(ROOT)
                .then()
                .statusCode(403);
        create(host, "PUBLIC", "RENJU");
        request(host)
                .body(Map.of("visibility", "PUBLIC", "rule", "RENJU"))
                .post(ROOT)
                .then()
                .statusCode(409);
        request(host).get(ROOT + "/me").then().statusCode(200).body("data.roomId", equalTo(1));
    }

    @Test
    @DisplayName("서버 기한이 지나면 착수를 거부하고 시간패를 저장한다")
    void persistsTimeout() {
        // Given
        String host = member("가을", "time-host"), guest = member("겨울", "time-guest");
        long id = create(host, "PUBLIC", "RENJU");
        request(guest).body(Map.of()).post(ROOT + "/" + id + "/join");
        ready(host, id, 1);
        ready(guest, id, 1);
        start(host, id, 1);
        jdbc.update(
                "update gomoku_room set turn_deadline=timestamp '2000-01-01 00:00:00' where id=?",
                id);
        // When
        request(host)
                .body(
                        Map.of(
                                "gameNumber",
                                1,
                                "expectedPly",
                                0,
                                "x",
                                7,
                                "y",
                                7,
                                "requestId",
                                UUID.randomUUID()))
                .post(ROOT + "/" + id + "/moves")
                .then()
                .statusCode(409);
        // Then
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .body("data.status", equalTo("FINISHED"))
                .body("data.endReason", equalTo("TIMEOUT"));
    }

    private void start(String token, long id, int game) {
        request(token)
                .body(Map.of("gameNumber", game))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(200);
    }
    @Test
    @DisplayName("두 사람이 준비한 뒤 방장만 시작할 수 있고 준비만으로는 제한 시간이 흐르지 않는다")
    void hostStartsReadyRoomWithAuthorizationAndStaleProtection() {
        // Given
        String host = member("가을", "start-host");
        String guest = member("겨울", "start-guest");
        String outsider = member("봄날", "start-outsider");
        long id = create(host, "PUBLIC", "RENJU");
        request(host)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(409);
        request(guest)
                .body(Map.of())
                .post(ROOT + "/" + id + "/join")
                .then()
                .statusCode(200);
        ready(host, id, 1);
        ready(guest, id, 1);
        // When / Then
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .body("data.status", equalTo("WAITING"))
                .body("data.gameNumber", equalTo(0))
                .body("data.turnDeadline", nullValue())
                .body("data.hostReady", equalTo(true))
                .body("data.guestReady", equalTo(true));
        request(guest)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(403);
        request(outsider)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(403);
        request(null)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(401);
        given()
                .cookie(cookies.accessTokenName(), host)
                .contentType("application/json")
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(403);
        request(host)
                .body(Map.of())
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(400);
        request(host)
                .body(Map.of("gameNumber", 2))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(409);
        request(guest)
                .body(Map.of("ready", false, "gameNumber", 1))
                .put(ROOT + "/" + id + "/ready")
                .then()
                .statusCode(200);
        request(host)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(409);
        ready(guest, id, 1);
        start(host, id, 1);
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .body("data.status", equalTo("PLAYING"))
                .body("data.gameNumber", equalTo(1))
                .body("data.hostReady", equalTo(false))
                .body("data.guestReady", equalTo(false));
        request(host)
                .body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(409);
        request(host)
                .body(Map.of("gameNumber", 2))
                .post(ROOT + "/" + id + "/start")
                .then()
                .statusCode(409);
    }

    private void ready(String token, long id, int game) {
        request(token)
                .body(Map.of("ready", true, "gameNumber", game))
                .put(ROOT + "/" + id + "/ready")
                .then()
                .statusCode(200);
    }

    @Test
    @DisplayName("성공한 착수의 재시도는 상대 시간패 이후에도 성공으로 확인한다")
    void acknowledgesAcceptedMoveAfterOpponentTimeout() {
        // Given
        String host = member("가을", "retry-host"), guest = member("겨울", "retry-guest");
        long id = create(host, "PUBLIC", "RENJU");
        request(guest).body(Map.of()).post(ROOT + "/" + id + "/join");
        ready(host, id, 1);
        ready(guest, id, 1);
        start(host, id, 1);
        long black = request(host).get(ROOT + "/" + id).jsonPath().getLong("data.blackMemberId");
        String actor = black == 1 ? host : guest;
        var body =
                Map.of(
                        "gameNumber",
                        1,
                        "expectedPly",
                        0,
                        "x",
                        7,
                        "y",
                        7,
                        "requestId",
                        UUID.randomUUID());
        request(actor).body(body).post(ROOT + "/" + id + "/moves").then().statusCode(200);
        jdbc.update(
                "update gomoku_room set turn_deadline=timestamp '2000-01-01 00:00:00' where id=?",
                id);
        // When / Then
        request(actor).body(body).post(ROOT + "/" + id + "/moves").then().statusCode(200);
        request(host)
                .get(ROOT + "/" + id)
                .then()
                .body("data.ply", equalTo(1))
                .body("data.endReason", equalTo("TIMEOUT"));
    }

    @Test
    @DisplayName("닫힌 방에는 다시 참가할 수 없으며 이전 방 퇴장이 새 방 좌석을 지우지 않는다")
    void releasesSeatsWithoutAffectingNewRoom() {
        // Given
        String host = member("가을", "leave-host");
        long first = create(host, "PUBLIC", "RENJU");
        request(host).post(ROOT + "/" + first + "/leave").then().statusCode(200);
        request(host).body(Map.of()).post(ROOT + "/" + first + "/join").then().statusCode(409);
        long second = create(host, "PUBLIC", "FREESTYLE");
        // When
        request(host).post(ROOT + "/" + first + "/leave").then().statusCode(200);
        // Then
        request(host).get(ROOT + "/me").then().body("data.roomId", equalTo((int) second));
    }

    private long create(String token, String visibility, String rule) {
        return request(token)
                .body(Map.of("visibility", visibility, "rule", rule))
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
        var request =
                given().contentType("application/json")
                        .cookie("XSRF-TOKEN", csrf)
                        .header("X-XSRF-TOKEN", csrf);
        return token == null ? request : request.cookie(cookies.accessTokenName(), token);
    }
}

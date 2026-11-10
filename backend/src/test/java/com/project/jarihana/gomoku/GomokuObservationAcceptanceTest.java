package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.gomoku.command.service.GomokuObservationService;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;

import io.restassured.specification.RequestSpecification;
import io.restassured.response.Response;
import io.restassured.RestAssured;
import io.restassured.path.json.JsonPath;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "gomoku.chat.enabled=true")
class GomokuObservationAcceptanceTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/gomoku/rooms";
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired JdbcTemplate jdbc;
    @Autowired GomokuObservationService observations;

    @Test
    @DisplayName("대국 스트림은 판 변경 없이 관전 입장과 퇴장을 회원별로 전달한다")
    void streamsSpectatorPresenceWithoutChangingTheGame() throws Exception {
        // Given
        String host = member("방장"), guest = member("손님"), spectator = member("관객");
        long room = create(host, "PUBLIC");
        join(guest, room);
        start(host, guest, room, 1);
        long memberId = jdbc.queryForObject("select id from member where crew_name='관객'", Long.class);
        String githubId = jdbc.queryForObject("select github_id from member where id=?", String.class, memberId);
        var before = jdbc.queryForMap("select revision,turn_deadline,touched_at from gomoku_room where id=?", room);
        HttpURLConnection connection = (HttpURLConnection) URI.create("http://localhost:" + RestAssured.port
                + RestAssured.basePath + ROOT + "/" + room + "/events").toURL().openConnection();
        connection.setRequestProperty("Cookie", "accessToken=" + host);
        connection.setReadTimeout(5000);
        try (var reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            assertEquals(0, nextSpectators(reader).getList("spectators").size());

            // When
            String participation = enter(spectator, room, UUID.randomUUID());
            UUID first = observations.connect(room, memberId, UUID.fromString(participation));
            UUID second = observations.connect(room, memberId, UUID.fromString(participation));

            // Then
            JsonPath joined = nextSpectators(reader);
            assertEquals(room, joined.getLong("roomId"));
            assertEquals(List.of("관객"), joined.getList("spectators.name"));
            assertEquals(memberId, joined.getLong("spectators[0].memberId"));
            assertEquals("https://avatars.githubusercontent.com/u/" + githubId,
                    joined.getString("spectators[0].avatarUrl"));
            observations.disconnect(first);
            observations.disconnect(second);
            assertEquals(0, nextSpectators(reader).getList("spectators").size());
            assertEquals(before, jdbc.queryForMap("select revision,turn_deadline,touched_at from gomoku_room where id=?", room));
        } finally {
            connection.disconnect();
        }
    }

    private JsonPath nextSpectators(BufferedReader reader) throws Exception {
        String event = "";
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.startsWith("event:")) event = line.substring(6).strip();
            if (line.startsWith("data:") && event.equals("spectators_changed"))
                return JsonPath.from(line.substring(5));
        }
        throw new AssertionError("관전자 상태 이벤트를 받지 못했습니다.");
    }

    @Test
    @DisplayName("회원은 진행 중인 공개방을 멱등하게 관전하며 참가 좌석을 차지하지 않는다")
    void observesOnlyPlayingPublicRoomsWithoutClaimingSeat() {
        // Given
        String host = member("방장"), guest = member("손님"), spectator = member("관객");
        long room = create(host, "PUBLIC");
        observe(spectator, room, UUID.randomUUID()).then().statusCode(409);
        join(guest, room);
        start(host, guest, room, 1);
        UUID requestId = UUID.randomUUID();

        // When
        String participation = observe(spectator, room, requestId).then().statusCode(201)
                .extract().jsonPath().getString("data.participationId");

        // Then
        observe(spectator, room, requestId).then().statusCode(200)
                .body("data.participationId", equalTo(participation));
        request(spectator).get(ROOT + "/me").then().body("data.roomId", equalTo(null));
        request(spectator).get(ROOT + "/" + room).then().statusCode(403);
        request(spectator).queryParam("participationId", participation).get(ROOT + "/" + room)
                .then().statusCode(200).body("data.status", equalTo("PLAYING"));
        request(host).queryParam("participationId", participation).get(ROOT + "/" + room)
                .then().statusCode(403);
        request(spectator).body(Map.of("ready", true, "gameNumber", 2))
                .put(ROOT + "/" + room + "/ready").then().statusCode(403);
        request(spectator).body(Map.of("gameNumber", 1))
                .post(ROOT + "/" + room + "/resign").then().statusCode(403);
        request(spectator).body(Map.of("gameNumber", 2))
                .post(ROOT + "/" + room + "/start").then().statusCode(403);
        request(spectator).body(Map.of("gameNumber", 1, "expectedPly", 0, "x", 7, "y", 7, "requestId", UUID.randomUUID()))
                .post(ROOT + "/" + room + "/moves").then().statusCode(403);
        request(spectator).post(ROOT + "/" + room + "/leave").then().statusCode(403);
        request(spectator).post(ROOT + "/" + room + "/invite").then().statusCode(403);
        request(host).queryParam("participationId", participation).get(ROOT + "/" + room + "/events")
                .then().statusCode(403);
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        given().contentType("application/json").cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf)
                .body(Map.of("requestId", UUID.randomUUID()))
                .post(ROOT + "/" + room + "/observations").then().statusCode(401);
        long privateRoom = create(member("비공개"), "PRIVATE");
        observe(spectator, privateRoom, UUID.randomUUID()).then().statusCode(403);
    }

    @Test
    @DisplayName("관전자는 입장 이후 대화만 보고 자신의 역할로 전송하며 재입장 경계를 초기화한다")
    void restrictsChatToObservationAndResetsOnExplicitReentry() {
        // Given
        String host = member("방장"), guest = member("손님"), spectator = member("관객"), other = member("다른관객");
        long room = create(host, "PUBLIC");
        String hostParticipation = chatSession(host, room);
        send(host, room, hostParticipation, UUID.randomUUID(), "입장 전 대화").then().statusCode(201);
        join(guest, room);
        start(host, guest, room, 1);
        UUID requestId = UUID.randomUUID();
        String participation = enter(spectator, room, requestId);
        var before = jdbc.queryForMap("select revision,turn_deadline,touched_at from gomoku_room where id=?", room);
        UUID messageId = UUID.randomUUID();

        // When / Then
        request(spectator).queryParam("participationId", participation).queryParam("afterSequence", "0")
                .get(chatPath(room)).then().statusCode(200).body("data.items", hasSize(0));
        send(spectator, room, participation, messageId, "여기에 두세요").then().statusCode(201)
                .body("data.senderRole", equalTo("SPECTATOR")).body("data.author", equalTo("관객"));
        send(spectator, room, participation, messageId, "여기에 두세요").then().statusCode(200);
        request(host).get(chatPath(room)).then().body("data.items", hasSize(2))
                .body("data.items[1].senderRole", equalTo("SPECTATOR"));
        request(spectator).queryParam("participationId", participation).queryParam("beforeSequence", "999")
                .get(chatPath(room)).then().body("data.items", hasSize(1));
        send(other, room, participation, UUID.randomUUID(), "다른 회원").then().statusCode(403);
        assertEquals(before, jdbc.queryForMap("select revision,turn_deadline,touched_at from gomoku_room where id=?", room));
        observe(spectator, room, requestId).then().statusCode(200)
                .body("data.participationId", equalTo(participation));

        // When: a different tab stays while the first tab explicitly leaves.
        String secondTab = enter(spectator, room, UUID.randomUUID());
        leave(spectator, room, participation);
        leave(spectator, room, participation);
        send(spectator, room, participation, UUID.randomUUID(), "퇴장 후 전송").then().statusCode(403);
        request(other).delete(ROOT + "/" + room + "/observations/" + secondTab).then().statusCode(403);
        send(spectator, room, secondTab, UUID.randomUUID(), "다른 탭 대화").then().statusCode(201);
        observe(spectator, room, requestId).then().statusCode(409);
        String returned = enter(spectator, room, UUID.randomUUID());

        // Then
        assertNotEquals(participation, returned);
        request(spectator).queryParam("participationId", returned).get(chatPath(room))
                .then().statusCode(200).body("data.items", hasSize(0));
    }

    @Test
    @DisplayName("기존 관전은 결과와 재대결에 유지되고 방 종료 뒤에는 새 관전과 채팅을 차단한다")
    void continuesThroughRematchAndStopsOnRoomClose() {
        // Given
        String host = member("방장"), guest = member("손님"), spectator = member("관객");
        long room = create(host, "PUBLIC");
        join(guest, room);
        start(host, guest, room, 1);
        UUID requestId = UUID.randomUUID();
        String participation = enter(spectator, room, requestId);

        // When / Then
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/" + room + "/resign").then().statusCode(200);
        observe(spectator, room, requestId).then().statusCode(200);
        observe(member("새관객"), room, UUID.randomUUID()).then().statusCode(409);
        send(spectator, room, participation, UUID.randomUUID(), "다시 해요").then().statusCode(201);
        start(host, guest, room, 2);
        request(spectator).queryParam("participationId", participation).get(ROOT + "/" + room)
                .then().body("data.gameNumber", equalTo(2));
        request(host).post(ROOT + "/" + room + "/leave").then().statusCode(200);
        request(spectator).queryParam("participationId", participation).get(ROOT + "/" + room)
                .then().statusCode(200).body("data.status", equalTo("CLOSED"));
        send(spectator, room, participation, UUID.randomUUID(), "종료 후").then().statusCode(403);
        observe(spectator, room, UUID.randomUUID()).then().statusCode(409);
        leave(spectator, room, participation);
    }

    private String member(String name) {
        return tokens.issue(members.save(Member.create(name, 23, UUID.randomUUID().toString(), Course.BACKEND)).getId()).value();
    }

    @Test
    @DisplayName("접속 lease를 회원별로 합산하고 한 탭 퇴장과 만료 및 이전 연결 정리를 구분한다")
    void countsUniqueConnectedMembersAcrossIndependentLeases() {
        // Given
        String host = member("방장"), guest = member("손님"), spectator = member("관객"), other = member("다른관객");
        long room = create(host, "PUBLIC");
        join(guest, room);
        start(host, guest, room, 1);
        long memberId = jdbc.queryForObject("select id from member where crew_name='관객'", Long.class);
        long otherId = jdbc.queryForObject("select id from member where crew_name='다른관객'", Long.class);
        String first = enter(spectator, room, UUID.randomUUID());
        String second = enter(spectator, room, UUID.randomUUID());
        String third = enter(other, room, UUID.randomUUID());
        UUID oldConnection = observations.connect(room, memberId, UUID.fromString(first));
        UUID replacement = observations.connect(room, memberId, UUID.fromString(first));
        UUID secondTab = observations.connect(room, memberId, UUID.fromString(second));
        observations.connect(room, otherId, UUID.fromString(third));

        // When / Then
        given().queryParam("view", "summary").get(ROOT).then().statusCode(200).body("data.items[0].spectatorCount", equalTo(2));
        observations.disconnect(oldConnection);
        assertEquals(1, jdbc.queryForObject("select count(*) from gomoku_observer_connection where connection_id=?", Integer.class, replacement));
        leave(spectator, room, first);
        given().queryParam("view", "summary").get(ROOT).then().body("data.items[0].spectatorCount", equalTo(2));
        jdbc.update("update gomoku_observer_connection set expires_at=timestamp '2000-01-01 00:00:00' where connection_id=?", secondTab);
        given().queryParam("view", "summary").get(ROOT).then().body("data.items[0].spectatorCount", equalTo(1));
        observations.removeExpiredConnections();
        assertEquals(0, jdbc.queryForObject("select count(*) from gomoku_observer_connection where connection_id=?", Integer.class, secondTab));
        leave(other, room, third);
        given().queryParam("view", "summary").get(ROOT).then().body("data.items[0].spectatorCount", equalTo(0));
    }

    private long create(String token, String visibility) {
        return request(token).body(Map.of("visibility", visibility, "rule", "RENJU")).post(ROOT)
                .then().statusCode(201).extract().jsonPath().getLong("data.roomId");
    }

    private void join(String token, long room) {
        request(token).body(Map.of()).post(ROOT + "/" + room + "/join").then().statusCode(200);
    }

    private void start(String host, String guest, long room, int gameNumber) {
        for (String player : List.of(host, guest)) request(player).body(Map.of("ready", true, "gameNumber", gameNumber))
                .put(ROOT + "/" + room + "/ready").then().statusCode(200);
        request(host).body(Map.of("gameNumber", gameNumber)).post(ROOT + "/" + room + "/start").then().statusCode(200);
    }

    private Response observe(String token, long room, UUID requestId) {
        return request(token).body(Map.of("requestId", requestId)).post(ROOT + "/" + room + "/observations");
    }

    private String enter(String token, long room, UUID requestId) {
        return observe(token, room, requestId).then().statusCode(201).extract().jsonPath().getString("data.participationId");
    }

    private void leave(String token, long room, String participation) {
        request(token).delete(ROOT + "/" + room + "/observations/" + participation).then().statusCode(204);
    }

    private String chatSession(String token, long room) {
        return request(token).get(chatPath(room)).then().statusCode(200).extract().jsonPath().getString("data.participationId");
    }

    private Response send(String token, long room, String session, UUID key, String content) {
        return request(token).body(Map.of("participationId", session, "clientMessageId", key, "content", content)).post(chatPath(room));
    }

    private String chatPath(long room) {
        return ROOT + "/" + room + "/chat/messages";
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        return given().contentType("application/json").cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf).cookie("accessToken", token);
    }
}

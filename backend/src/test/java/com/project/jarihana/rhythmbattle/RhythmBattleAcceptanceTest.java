package com.project.jarihana.rhythmbattle;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;

import io.restassured.path.json.JsonPath;
import io.restassured.response.ValidatableResponse;
import io.restassured.specification.RequestSpecification;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class RhythmBattleAcceptanceTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/rhythm-battle";
    private static final long FIXED_EPOCH_MILLIS =
            TestSupportConfig.FIXED_NOW.atZone(TestSupportConfig.ZONE).toInstant().toEpochMilli();

    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("공개 방은 빈자리가 있는 동안 대기실에 보이고 한 사람만 더 들어올 수 있으며 회원은 한 방에만 앉는다")
    void publicRoomsAreListedAndSeatOneGuest() {
        // Given
        Player host = player("가을", "battle-public-host");
        Player guest = player("겨울", "battle-public-guest");
        Player third = player("하늘", "battle-public-third");

        // When
        long roomId = create(host, "PUBLIC", "HARD");

        // Then
        request(null).body(Map.of("visibility", "PUBLIC", "level", "EASY")).post(ROOT + "/rooms")
                .then().statusCode(401);
        request(host).body(Map.of("visibility", "PUBLIC", "level", "EASY")).post(ROOT + "/rooms")
                .then().statusCode(409).body("error.code", equalTo("RHYTHM_BATTLE_CONFLICT"));
        request(third).get(ROOT + "/rooms")
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].id", equalTo((int) roomId))
                .body("data.items[0].hostName", equalTo("가을"))
                .body("data.items[0].hostAvatarUrl", startsWith("https://avatars.githubusercontent.com/u/"))
                .body("data.items[0].level", equalTo("HARD"))
                .body("data.hasNext", equalTo(false));
        join(guest, roomId, null).statusCode(200);
        join(third, roomId, null).statusCode(409);
        request(third).get(ROOT + "/rooms").then().statusCode(200).body("data.items", hasSize(0));
        request(guest).get(ROOT + "/rooms/me").then().statusCode(200).body("data.roomId", equalTo((int) roomId));
        request(third).get(ROOT + "/rooms/me").then().statusCode(200).body("data.roomId", nullValue());
        request(third).get(ROOT + "/rooms/" + roomId).then().statusCode(403);
        request(host).get(ROOT + "/rooms/" + roomId)
                .then().statusCode(200)
                .body("data.status", equalTo("WAITING"))
                .body("data.level", equalTo("HARD"))
                .body("data.chartVersion", equalTo("bars-13-16-1"))
                .body("data.host.memberId", equalTo((int) host.id()))
                .body("data.guest.memberId", equalTo((int) guest.id()))
                .body("data.guest.name", equalTo("겨울"))
                .body("data.guest.avatarUrl", startsWith("https://avatars.githubusercontent.com/u/"))
                .body("data.serverNow", equalTo(FIXED_EPOCH_MILLIS))
                .body("data.runs", hasSize(0));
    }

    @Test
    @DisplayName("초대 전용 방은 대기실에 보이지 않고 초대 링크로만 들어온다")
    void privateRoomsNeedAnInvitation() {
        // Given
        Player host = player("가을", "battle-private-host");
        Player guest = player("겨울", "battle-private-guest");
        long roomId = create(host, "PRIVATE", "EASY");

        // When
        String token = request(host).body(Map.of()).post(ROOT + "/rooms/" + roomId + "/invite")
                .then().statusCode(200).extract().jsonPath().getString("data.token");

        // Then
        request(guest).get(ROOT + "/rooms").then().statusCode(200).body("data.items", hasSize(0));
        join(guest, roomId, null).statusCode(403);
        request(guest).get(ROOT + "/invitations/" + token)
                .then().statusCode(200)
                .body("data.roomId", equalTo((int) roomId))
                .body("data.hostName", equalTo("가을"))
                .body("data.level", equalTo("EASY"))
                .body("data.joinable", equalTo(true));
        join(guest, roomId, token).statusCode(200);
    }

    @Test
    @DisplayName("두 사람이 준비하면 방장이 시작하고, 서버가 정한 시드와 공통 시작 시각으로 두 사람의 판을 만든다")
    void startsBothRunsWithTheSharedSeedAndStart() {
        // Given
        Player host = player("가을", "battle-start-host");
        Player guest = player("겨울", "battle-start-guest");
        long roomId = room(host, guest, "MEDIUM");

        // When
        ready(host, roomId, 1, 1.5).statusCode(200);
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + roomId + "/start").then().statusCode(409);
        ready(guest, roomId, 1, 2).statusCode(200);
        request(guest).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + roomId + "/start").then().statusCode(403);
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + roomId + "/start").then().statusCode(200);

        // Then
        request(guest).get(ROOT + "/rooms/" + roomId)
                .then().statusCode(200)
                .body("data.status", equalTo("PLAYING"))
                .body("data.gameNumber", equalTo(1))
                .body("data.seed", notNullValue())
                .body("data.startsAt", equalTo(FIXED_EPOCH_MILLIS + 5000))
                .body("data.runs", hasSize(2))
                .body("data.runs.find { it.memberId == " + host.id() + " }.scrollSpeed", equalTo(1.5f))
                .body("data.runs.find { it.memberId == " + guest.id() + " }.scrollSpeed", equalTo(2.0f))
                .body("data.runs.find { it.memberId == " + guest.id() + " }.status", equalTo("PLAYING"))
                .body("data.runs.find { it.memberId == " + guest.id() + " }.lives", equalTo(8));
    }

    @Test
    @DisplayName("라이프를 먼저 모두 잃은 쪽이 지고, 상대가 그 곡 시각까지 살아 있는 것을 확인하면 판이 끝나 기록과 랭킹에 남는다")
    void firstEliminationLoses() throws IOException {
        // Given
        Player host = player("가을", "battle-win-host");
        Player guest = player("겨울", "battle-win-guest");
        long roomId = started(host, guest, "HARDEST");
        double[] first = firstNote("hardest");
        elapse(roomId, 300);

        // When
        JsonPath hostOut = batch(host, roomId, 1, 1, 299, List.of()).statusCode(200)
                .body("data.status", equalTo("OUT"))
                .body("data.outReason", equalTo("ELIMINATED"))
                .body("data.lives", equalTo(0))
                .body("data.roomStatus", equalTo("PLAYING"))
                .extract().jsonPath();
        double hostOutAt = hostOut.getDouble("data.outAt");
        elapse(roomId, (int) Math.ceil(hostOutAt - 1));
        batch(guest, roomId, 1, 1, hostOutAt - 1, List.of(input((int) first[0], first[1])))
                .statusCode(200).body("data.status", equalTo("PLAYING")).body("data.roomStatus", equalTo("PLAYING"));
        elapse(roomId, 300);
        batch(guest, roomId, 1, 2, 299, List.of()).statusCode(200)
                .body("data.roomStatus", equalTo("FINISHED"))
                .body("data.winnerMemberId", equalTo((int) guest.id()))
                .body("data.endReason", equalTo("ELIMINATED"));

        // Then
        request(host).get(ROOT + "/rooms/" + roomId)
                .then().statusCode(200)
                .body("data.status", equalTo("FINISHED"))
                .body("data.winnerMemberId", equalTo((int) guest.id()))
                .body("data.startsAt", nullValue());
        // 판이 끝난 뒤 늦게 도착한 묶음은 계산하지 않고 결과를 돌려준다.
        batch(host, roomId, 1, 2, 299, List.of()).statusCode(200).body("data.roomStatus", equalTo("FINISHED"));
        request(host).get(ROOT + "/ranking")
                .then().statusCode(200)
                .body("data.items", hasSize(2))
                .body("data.items[0].memberId", equalTo((int) guest.id()))
                .body("data.items[0].rank", equalTo(1))
                .body("data.items[0].wins", equalTo(1))
                .body("data.items[0].avatarUrl", startsWith("https://avatars.githubusercontent.com/u/"))
                .body("data.items[1].losses", equalTo(1))
                .body("data.me.rank", equalTo(2));
        request(host).get(ROOT + "/history/me/summary")
                .then().statusCode(200)
                .body("data.total", equalTo(1))
                .body("data.wins", equalTo(0))
                .body("data.losses", equalTo(1))
                .body("data.draws", equalTo(0));
    }

    @Test
    @DisplayName("같은 곡 시각에 함께 탈락하면 무승부다")
    void sameEliminationTimeIsADraw() {
        // Given
        Player host = player("가을", "battle-draw-host");
        Player guest = player("겨울", "battle-draw-guest");
        long roomId = started(host, guest, "HARDEST");
        elapse(roomId, 300);

        // When
        batch(host, roomId, 1, 1, 299, List.of()).statusCode(200).body("data.roomStatus", equalTo("PLAYING"));
        batch(guest, roomId, 1, 1, 299, List.of()).statusCode(200)
                .body("data.roomStatus", equalTo("FINISHED"))
                .body("data.winnerMemberId", nullValue())
                .body("data.endReason", equalTo("DRAW"));

        // Then
        request(host).get(ROOT + "/history/me/summary")
                .then().statusCode(200).body("data.total", equalTo(1)).body("data.draws", equalTo(1));
    }

    @Test
    @DisplayName("진행 중에 화면을 떠나거나 나가면 기권으로 지고, 나간 사람이 있으면 결과를 남긴 채 방을 닫는다")
    void forfeitAndLeavingEndTheGame() {
        // Given
        Player host = player("가을", "battle-forfeit-host");
        Player guest = player("겨울", "battle-forfeit-guest");
        long roomId = started(host, guest, "EASY");

        // When
        request(guest).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + roomId + "/forfeit")
                .then().statusCode(200)
                .body("data.status", equalTo("OUT"))
                .body("data.outReason", equalTo("ABANDONED"))
                .body("data.roomStatus", equalTo("FINISHED"))
                .body("data.winnerMemberId", equalTo((int) host.id()))
                .body("data.endReason", equalTo("FORFEIT"));
        request(guest).body(Map.of()).post(ROOT + "/rooms/" + roomId + "/leave").then().statusCode(200);

        // Then
        request(host).get(ROOT + "/rooms/" + roomId).then().statusCode(200).body("data.status", equalTo("CLOSED"));
        request(host).get(ROOT + "/rooms/me").then().statusCode(200).body("data.roomId", nullValue());
        request(guest).get(ROOT + "/rooms/me").then().statusCode(200).body("data.roomId", nullValue());

        Player other = player("하늘", "battle-forfeit-other");
        Player rival = player("바다", "battle-forfeit-rival");
        long playing = started(other, rival, "EASY");
        request(other).body(Map.of()).post(ROOT + "/rooms/" + playing + "/leave").then().statusCode(200);
        request(rival).get(ROOT + "/rooms/" + playing)
                .then().statusCode(200)
                .body("data.status", equalTo("CLOSED"))
                .body("data.winnerMemberId", equalTo((int) rival.id()))
                .body("data.endReason", equalTo("FORFEIT"));
    }

    @Test
    @DisplayName("공통 시작 시각보다 앞선 진행을 보내면 시각 위반으로 지고, 판이 끝나면 다시 준비해 다음 판을 시작한다")
    void clockViolationLosesAndRematchStartsTheNextGame() {
        // Given
        Player host = player("가을", "battle-clock-host");
        Player guest = player("겨울", "battle-clock-guest");
        long roomId = started(host, guest, "EASY");

        // When
        batch(host, roomId, 1, 1, 30, List.of()).statusCode(200)
                .body("data.status", equalTo("OUT"))
                .body("data.outReason", equalTo("CLOCK_AHEAD"))
                .body("data.roomStatus", equalTo("FINISHED"))
                .body("data.winnerMemberId", equalTo((int) guest.id()));
        ready(host, roomId, 1, 1).statusCode(409);
        ready(host, roomId, 2, 1).statusCode(200);
        ready(guest, roomId, 2, 1).statusCode(200);
        request(host).body(Map.of("gameNumber", 2)).post(ROOT + "/rooms/" + roomId + "/start").then().statusCode(200);

        // Then
        request(host).get(ROOT + "/rooms/" + roomId)
                .then().statusCode(200)
                .body("data.status", equalTo("PLAYING"))
                .body("data.gameNumber", equalTo(2))
                .body("data.winnerMemberId", nullValue())
                .body("data.runs", hasSize(2))
                .body("data.runs[0].status", equalTo("PLAYING"));
    }

    @Test
    @DisplayName("방 채팅은 참가자만 보내고, 같은 메시지 번호로 다시 보내도 한 번만 남으며 들어온 뒤의 대화만 본다")
    void chatsWithinTheRoom() {
        // Given
        Player host = player("가을", "battle-chat-host");
        Player guest = player("겨울", "battle-chat-guest");
        Player outsider = player("하늘", "battle-chat-outsider");
        long roomId = create(host, "PUBLIC", "EASY");
        UUID first = UUID.randomUUID();

        // When
        chat(host, roomId, first, "  먼저 와 있어요  ").statusCode(201).body("data.body", equalTo("먼저 와 있어요"));
        join(guest, roomId, null).statusCode(200);
        chat(guest, roomId, UUID.randomUUID(), "한 판 해요").statusCode(201)
                .body("data.senderName", equalTo("겨울"))
                .body("data.memberId", equalTo((int) guest.id()));
        chat(host, roomId, first, "먼저 와 있어요").statusCode(201);

        // Then
        chat(outsider, roomId, UUID.randomUUID(), "몰래").statusCode(403);
        chat(host, roomId, UUID.randomUUID(), " ").statusCode(400);
        request(host).get(ROOT + "/rooms/" + roomId + "/chat/messages")
                .then().statusCode(200)
                .body("data.items", hasSize(2))
                .body("data.items[0].body", equalTo("먼저 와 있어요"))
                .body("data.items[1].body", equalTo("한 판 해요"));
        request(guest).get(ROOT + "/rooms/" + roomId + "/chat/messages")
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].body", equalTo("한 판 해요"));
        request(outsider).get(ROOT + "/rooms/" + roomId + "/chat/messages").then().statusCode(403);
    }

    private long started(Player host, Player guest, String level) {
        long roomId = room(host, guest, level);
        ready(host, roomId, 1, 1).statusCode(200);
        ready(guest, roomId, 1, 1).statusCode(200);
        request(host).body(Map.of("gameNumber", 1)).post(ROOT + "/rooms/" + roomId + "/start").then().statusCode(200);
        return roomId;
    }

    private long room(Player host, Player guest, String level) {
        long roomId = create(host, "PUBLIC", level);
        join(guest, roomId, null).statusCode(200);
        return roomId;
    }

    private long create(Player host, String visibility, String level) {
        return request(host).body(Map.of("visibility", visibility, "level", level)).post(ROOT + "/rooms")
                .then().statusCode(201).extract().jsonPath().getLong("data.roomId");
    }

    private ValidatableResponse join(Player player, long roomId, String token) {
        Map<String, Object> body = token == null ? Map.of() : Map.of("token", token);
        return request(player).body(body).post(ROOT + "/rooms/" + roomId + "/join").then();
    }

    private ValidatableResponse ready(Player player, long roomId, int gameNumber, double scrollSpeed) {
        return request(player).body(Map.of("ready", true, "gameNumber", gameNumber, "scrollSpeed", scrollSpeed))
                .put(ROOT + "/rooms/" + roomId + "/ready").then();
    }

    private ValidatableResponse batch(Player player, long roomId, int gameNumber, int sequence, double playedUntil,
            List<Map<String, Object>> inputs) {
        return request(player)
                .body(Map.of("gameNumber", gameNumber, "sequence", sequence, "playedUntil", playedUntil,
                        "inputs", inputs, "finished", false))
                .post(ROOT + "/rooms/" + roomId + "/batches")
                .then();
    }

    private ValidatableResponse chat(Player player, long roomId, UUID clientMessageId, String body) {
        return request(player).body(Map.of("clientMessageId", clientMessageId.toString(), "body", body))
                .post(ROOT + "/rooms/" + roomId + "/chat/messages").then();
    }

    // 고정 시계를 쓰므로 공통 시작 시각을 과거로 옮겨 실제 시간이 흐른 것처럼 만든다.
    private void elapse(long roomId, int seconds) {
        jdbc.update("update rhythm_battle_run set starts_at=?, last_batch_at=? where room_id=?",
                TestSupportConfig.FIXED_NOW.minusSeconds(seconds), TestSupportConfig.FIXED_NOW, roomId);
    }

    private static Map<String, Object> input(int lane, double at) {
        return Map.of("lane", lane, "at", at);
    }

    // 채보 첫 박의 방향 순번과 곡 시작 기준 시각이다.
    private static double[] firstNote(String level) throws IOException {
        try (InputStream stream = RhythmBattleAcceptanceTest.class.getResourceAsStream("/rhythm-harpoon/ranked-chart.json")) {
            JsonNode chart = JsonMapper.builder().build().readTree(stream);
            JsonNode levelNode = chart.get("levels").get(level);
            double leadIn = 60 / chart.get("bpm").asDouble() * 4;
            JsonNode event = levelNode.get("events").get(0);
            int lane = List.of("left", "down", "right", "up").indexOf(event.get(2).get(0).asString());
            return new double[] {lane, leadIn + event.get(1).asDouble() / chart.get("sampleRateHz").asDouble()};
        }
    }

    private Player player(String name, String github) {
        Member member = members.save(Member.create(name, 23, github, Course.BACKEND));
        return new Player(tokens.issue(member.getId()).value(), member.getId());
    }

    private RequestSpecification request(Player player) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        var request = given().contentType("application/json")
                .cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf);
        return player == null ? request : request.cookie(cookies.accessTokenName(), player.token());
    }

    private record Player(String token, long id) {
    }
}

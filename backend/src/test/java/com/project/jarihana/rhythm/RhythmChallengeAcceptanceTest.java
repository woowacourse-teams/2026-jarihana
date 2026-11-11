package com.project.jarihana.rhythm;

import static io.restassured.RestAssured.given;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;

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

class RhythmChallengeAcceptanceTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/rhythm-harpoon";
    // 1루프의 카운트인 시간이다. 첫 루프는 기본 방향 배치라 채보의 방향을 그대로 쓴다.
    private static final double LEAD_IN = 1.875;

    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;

    @Test
    @DisplayName("공식 도전은 로그인한 회원만 만들 수 있고 서버가 정한 시드와 규칙 판본을 돌려준다")
    void createsChallengeWithServerSeed() {
        // Given
        String player = member("가을", "rhythm-create");

        // When & Then
        request(null).body(Map.of("level", "EASY", "scrollSpeed", 1.5)).post(ROOT + "/challenges")
                .then().statusCode(401);
        request(player).body(Map.of("level", "EASY", "scrollSpeed", 1.1)).post(ROOT + "/challenges")
                .then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
        request(player).body(Map.of("level", "EASY", "scrollSpeed", 1.5)).post(ROOT + "/challenges")
                .then().statusCode(201)
                .body("data.status", equalTo("CREATED"))
                .body("data.level", equalTo("EASY"))
                .body("data.scrollSpeed", equalTo(1.5f))
                .body("data.seed", notNullValue())
                .body("data.rulesVersion", equalTo("rhythm-harpoon-ranked-4"))
                .body("data.chartVersion", equalTo("bars-13-16-1"))
                .body("data.lives", equalTo(10));
    }

    @Test
    @DisplayName("서버가 받은 입력으로 점수를 다시 계산하고 라이프를 모두 잃으면 기록과 순위에 남긴다")
    void recomputesScoreAndRanksFinishedRuns() throws IOException {
        // Given
        String player = member("가을", "rhythm-finish");
        long id = start(player, "EASY");
        double[] first = firstNote("easy");
        elapse(id, 5);

        // When
        batch(player, id, 1, 4, List.of(input((int) first[0], first[1] + 0.01)), false)
                .statusCode(200)
                .body("data.status", equalTo("PLAYING"))
                .body("data.score", equalTo(1000))
                .body("data.perfect", equalTo(1));
        elapse(id, 60);
        batch(player, id, 2, 59, List.of(), false)
                .statusCode(200)
                .body("data.status", equalTo("FINISHED"))
                .body("data.lives", equalTo(0))
                .body("data.score", equalTo(1000))
                .body("data.finishedAt", notNullValue());

        // Then
        request(player).queryParam("level", "EASY").get(ROOT + "/rankings")
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].rank", equalTo(1))
                .body("data.items[0].name", equalTo("가을"))
                .body("data.items[0].score", equalTo(1000))
                .body("data.items[0].challengeId", equalTo((int) id))
                .body("data.me.rank", equalTo(1));
        request(player).queryParam("level", "HARD").get(ROOT + "/rankings")
                .then().statusCode(200).body("data.items", hasSize(0)).body("data.me", nullValue());
    }

    @Test
    @DisplayName("ANOTHER 난이도는 스윙 곡의 채보 판본으로 다시 계산하고 난이도마다 따로 순위를 매긴다")
    void recordsAnotherOnItsOwnSongAndRanking() throws IOException {
        // Given
        String player = member("가을", "rhythm-another");
        request(player).body(Map.of("level", "ANOTHER_HARD", "scrollSpeed", 1)).post(ROOT + "/challenges")
                .then().statusCode(201)
                .body("data.level", equalTo("ANOTHER_HARD"))
                .body("data.rulesVersion", equalTo("rhythm-harpoon-ranked-4"))
                .body("data.chartVersion", equalTo("swing-another-2"))
                .body("data.lives", equalTo(10));
        long id = start(player, "ANOTHER_HARDEST");
        double[] first = firstNote("anotherHardest");
        elapse(id, 5);

        // When
        batch(player, id, 1, 4, List.of(input((int) first[0], first[1] + 0.01)), false)
                .statusCode(200)
                .body("data.score", equalTo(1000))
                .body("data.perfect", equalTo(1));
        elapse(id, 60);
        batch(player, id, 2, 59, List.of(), false)
                .statusCode(200)
                .body("data.status", equalTo("FINISHED"))
                .body("data.lives", equalTo(0));

        // Then
        request(player).queryParam("level", "ANOTHER_HARDEST").get(ROOT + "/rankings")
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].score", equalTo(1000))
                .body("data.me.rank", equalTo(1));
        request(player).queryParam("level", "ANOTHER_HARD").get(ROOT + "/rankings")
                .then().statusCode(200).body("data.items", hasSize(0));
        request(player).queryParam("level", "HARDEST").get(ROOT + "/rankings")
                .then().statusCode(200).body("data.items", hasSize(0));
    }

    @Test
    @DisplayName("랭킹은 회원마다 가장 높은 기록 한 판으로 정렬하고 커서로 이어 본다")
    void ranksEachMembersBestRun() throws IOException {
        // Given
        String first = member("가을", "rhythm-rank-first");
        String second = member("겨울", "rhythm-rank-second");
        double[] note = firstNote("medium");
        finish(first, List.of());
        finish(first, List.of(input((int) note[0], note[1])));
        finish(second, List.of());

        // When
        var page = request(second).queryParam("level", "MEDIUM").queryParam("size", 1).get(ROOT + "/rankings")
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].name", equalTo("가을"))
                .body("data.items[0].score", equalTo(1000))
                .body("data.hasNext", equalTo(true))
                .body("data.me.rank", equalTo(2))
                .extract().jsonPath();

        // Then
        request(second).queryParam("level", "MEDIUM").queryParam("size", 1)
                .queryParam("cursor", page.getString("data.nextCursor")).get(ROOT + "/rankings")
                .then().statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].name", equalTo("겨울"))
                .body("data.items[0].rank", equalTo(2))
                .body("data.hasNext", equalTo(false))
                .body("data.nextCursor", nullValue());
        request(second).queryParam("level", "MEDIUM").queryParam("cursor", "bad").get(ROOT + "/rankings")
                .then().statusCode(400);
    }

    @Test
    @DisplayName("같은 순번을 다시 보내면 다시 계산하지 않고, 순번을 건너뛰거나 남의 도전에 보내면 거절한다")
    void keepsBatchesInOrderAndOwned() {
        // Given
        String player = member("가을", "rhythm-order");
        String other = member("겨울", "rhythm-order-other");
        long id = start(player, "EASY");
        elapse(id, 3);

        // When & Then
        batch(player, id, 1, 2, List.of(input(0, 1.0)), false).statusCode(200).body("data.sequence", equalTo(1));
        batch(player, id, 1, 2, List.of(input(0, 1.0), input(1, 1.5)), false)
                .statusCode(200).body("data.sequence", equalTo(1)).body("data.poor", equalTo(1));
        batch(player, id, 3, 3, List.of(), false).statusCode(409).body("error.code", equalTo("RHYTHM_CHALLENGE_CONFLICT"));
        batch(player, id, 2, 3, List.of(input(0, 0.5)), false).statusCode(400);
        request(player).body("{\"sequence\":2,\"playedUntil\":3,\"inputs\":[{\"lane\":0,\"at\":1e400}],\"finished\":false}")
                .post(ROOT + "/challenges/" + id + "/batches")
                .then().statusCode(400).body("error.code", equalTo("INVALID_PARAMETER"));
        batch(other, id, 2, 3, List.of(), false).statusCode(404).body("error.code", equalTo("RHYTHM_CHALLENGE_NOT_FOUND"));
        request(player).body(Map.of()).post(ROOT + "/challenges/" + id + "/start").then().statusCode(409);
    }

    @Test
    @DisplayName("일시정지처럼 진행이 늦거나 실제 시간보다 앞서거나 화면을 떠나면 무효가 되고 순위에 넣지 않는다")
    void invalidatesRunsThatLeaveRealTime() {
        // Given
        String player = member("가을", "rhythm-invalid");
        long lagged = start(player, "EASY");
        long ahead = start(player, "EASY");
        long abandoned = start(player, "EASY");
        elapse(lagged, 40);
        elapse(ahead, 10);

        // When & Then
        batch(player, lagged, 1, 20, List.of(), false)
                .statusCode(200).body("data.status", equalTo("INVALID")).body("data.invalidReason", equalTo("LAGGED"));
        batch(player, ahead, 1, 40, List.of(), false)
                .statusCode(200).body("data.status", equalTo("INVALID")).body("data.invalidReason", equalTo("CLOCK_AHEAD"));
        request(player).body(Map.of()).post(ROOT + "/challenges/" + abandoned + "/abandon")
                .then().statusCode(200).body("data.status", equalTo("INVALID"))
                .body("data.invalidReason", equalTo("ABANDONED"));
        batch(player, abandoned, 1, 1, List.of(), false).statusCode(200).body("data.status", equalTo("INVALID"));
        request(player).queryParam("level", "EASY").get(ROOT + "/rankings")
                .then().statusCode(200).body("data.items", hasSize(0));
    }

    @Test
    @DisplayName("화면에서 판이 끝났다고 알렸는데 서버 계산이 살아 있으면 입력 없이 끝까지 계산해 기록한다")
    void finishesRunsTheClientReportsOver() {
        // Given
        String player = member("가을", "rhythm-client-finish");
        long id = start(player, "HARDEST");
        elapse(id, 6);

        // When & Then
        batch(player, id, 1, 5, List.of(), true)
                .statusCode(200)
                .body("data.status", equalTo("FINISHED"))
                .body("data.lives", equalTo(0));
    }

    private void finish(String token, List<Map<String, Object>> inputs) {
        long id = start(token, "MEDIUM");
        elapse(id, 60);
        batch(token, id, 1, 58, inputs, false).statusCode(200).body("data.status", equalTo("FINISHED"));
    }

    private long start(String token, String level) {
        long id = request(token).body(Map.of("level", level, "scrollSpeed", 1)).post(ROOT + "/challenges")
                .then().statusCode(201).extract().jsonPath().getLong("data.challengeId");
        request(token).body(Map.of()).post(ROOT + "/challenges/" + id + "/start")
                .then().statusCode(200).body("data.status", equalTo("PLAYING"));
        return id;
    }

    // 고정 시계를 쓰므로 시작 시각을 과거로 옮겨 실제 시간이 흐른 것처럼 만든다.
    private void elapse(long id, int seconds) {
        jdbc.update("update rhythm_challenge set started_at=?, last_batch_at=? where id=?",
                TestSupportConfig.FIXED_NOW.minusSeconds(seconds), TestSupportConfig.FIXED_NOW, id);
    }

    private ValidatableResponse batch(String token, long id, int sequence, double playedUntil,
            List<Map<String, Object>> inputs, boolean finished) {
        return request(token)
                .body(Map.of("sequence", sequence, "playedUntil", playedUntil, "inputs", inputs, "finished", finished))
                .post(ROOT + "/challenges/" + id + "/batches")
                .then();
    }

    private static Map<String, Object> input(int lane, double at) {
        return Map.of("lane", lane, "at", at);
    }

    // 채보 첫 박의 방향 순번과 곡 시작 기준 시각이다. 다른 곡을 치는 난이도는 그 곡의 빠르기로 카운트인을 센다.
    private static double[] firstNote(String level) throws IOException {
        try (InputStream stream = RhythmChallengeAcceptanceTest.class.getResourceAsStream("/rhythm-harpoon/ranked-chart.json")) {
            JsonNode chart = JsonMapper.builder().build().readTree(stream);
            JsonNode levelNode = chart.get("levels").get(level);
            JsonNode song = levelNode.has("song") ? levelNode.get("song") : chart;
            double leadIn = levelNode.has("song") ? 60 / song.get("bpm").asDouble() * 4 : LEAD_IN;
            JsonNode event = levelNode.get("events").get(0);
            int lane = List.of("left", "down", "right", "up").indexOf(event.get(2).get(0).asString());
            return new double[] {lane, leadIn + event.get(1).asDouble() / song.get("sampleRateHz").asDouble()};
        }
    }

    private String member(String name, String github) {
        return tokens.issue(members.save(Member.create(name, 23, github, Course.BACKEND)).getId()).value();
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        var request = given().contentType("application/json")
                .cookie("XSRF-TOKEN", csrf)
                .header("X-XSRF-TOKEN", csrf);
        return token == null ? request : request.cookie(cookies.accessTokenName(), token);
    }
}

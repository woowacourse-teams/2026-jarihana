package com.project.jarihana.minigame;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.minigame.domain.Almond;
import com.project.jarihana.minigame.domain.AlmondSize;
import com.project.jarihana.minigame.domain.ChocolateLevel;
import com.project.jarihana.minigame.domain.StickPuzzle;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class PeperoDayEventAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("누구나 이벤트 기간과 진행 상태를 보고, 로그인 회원은 오늘 남은 도전 횟수도 본다.")
    @Test
    void showsEventStatus() {
        // Given
        Member member = saveMember("모카", "pepero-status-member");

        // When & Then
        given()
                .when()
                .get("/events/pepero-day")
                .then()
                .statusCode(200)
                .body("data.status", equalTo("OPEN"))
                .body("data.opensAt", equalTo("2026-08-19T00:00:00"))
                .body("data.closesAt", equalTo("2026-08-20T10:00:00"))
                .body("data.gameRoomOpensAt", equalTo("2026-08-20T13:00:00"))
                .body("data.gameRoomOpen", equalTo(false))
                .body("data.serverTime", equalTo("2026-08-19T10:00:00"))
                .body("data.dailyAttemptLimit", equalTo(3))
                .body("data.remainingAttempts", nullValue());
        withToken(member)
                .when()
                .get("/events/pepero-day")
                .then()
                .statusCode(200)
                .body("data.remainingAttempts", equalTo(3));
    }

    @DisplayName("순위 도전은 막대 5개를 차례로 자르면 끝나고, 끝난 판은 순위에 오른다.")
    @Test
    void playsRankedRunAndAppearsInRanking() {
        // Given
        Member member = saveMember("모카", "pepero-run-member");

        // When
        JsonPath started = startRun(member)
                .then()
                .statusCode(201)
                .body("data.round", equalTo(1))
                .body("data.timeLimitSeconds", equalTo(30))
                .body("data.remainingAttempts", equalTo(2))
                .body("data.stick.lengthCm", equalTo(12.0f))
                .body("data.stick.cells", hasSize(24))
                .body("data.stick.startPosition", notNullValue())
                .body("data.stick.totalMilligrams", notNullValue())
                .extract()
                .jsonPath();
        long runId = started.getLong("data.runId");
        Map<String, Object> stick = started.getMap("data.stick");
        int expectedTotal = 0;
        for (int round = 1; round <= 5; round++) {
            double answer = puzzleFrom(stick).answerPosition();
            JsonPath cut = cut(member, runId, round, answer)
                    .then()
                    .statusCode(200)
                    .body("data.round", equalTo(round))
                    .body("data.score", equalTo(1000))
                    .body("data.timedOut", equalTo(false))
                    .body("data.finished", equalTo(round == 5))
                    .extract()
                    .jsonPath();
            expectedTotal += 1000;
            assertThat(cut.getInt("data.totalScore")).isEqualTo(expectedTotal);
            assertThat(cut.getDouble("data.answerPosition")).isCloseTo(answer, within(1e-6));
            stick = cut.getMap("data.nextStick");
            if (round < 5) {
                assertThat(stick).isNotNull();
            }
        }

        // Then
        assertThat(stick).isNull();
        withToken(member)
                .when()
                .get("/events/pepero-day/rankings")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].rank", equalTo(1))
                .body("data.items[0].nickname", equalTo("모카"))
                .body("data.items[0].totalScore", equalTo(5000))
                .body("data.me.rank", equalTo(1))
                .body("data.me.totalScore", equalTo(5000));
    }

    @DisplayName("순위는 회원마다 가장 좋은 끝난 판 하나로 점수 높은 순으로 매기고, 끝나지 않은 판은 넣지 않는다.")
    @Test
    void ranksBestFinishedRunPerMember() {
        // Given
        Member first = saveMember("모카", "pepero-rank-first");
        Member second = saveMember("하루", "pepero-rank-second");
        Member unfinished = saveMember("리프", "pepero-rank-unfinished");
        finishRun(second, false);
        finishRun(first, true);
        finishRun(first, false);
        startRun(unfinished).then().statusCode(201);

        // When & Then
        given()
                .when()
                .get("/events/pepero-day/rankings")
                .then()
                .statusCode(200)
                .body("data.items", hasSize(2))
                .body("data.items[0].nickname", equalTo("모카"))
                .body("data.items[0].totalScore", equalTo(5000))
                .body("data.items[1].nickname", equalTo("하루"))
                .body("data.items[1].rank", equalTo(2))
                .body("data.me", nullValue());
        withToken(unfinished)
                .when()
                .get("/events/pepero-day/rankings")
                .then()
                .body("data.me", nullValue());
    }

    @DisplayName("순위 도전은 로그인해야 시작할 수 있고, 하루 3번까지만 시작할 수 있다.")
    @Test
    void limitsRankedRunsPerDay() {
        // Given
        Member member = saveMember("모카", "pepero-limit-member");
        String csrfToken = csrfToken();

        // When & Then
        given()
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .when()
                .post("/events/pepero-day/runs")
                .then()
                .statusCode(401);
        startRun(member).then().statusCode(201).body("data.remainingAttempts", equalTo(2));
        startRun(member).then().statusCode(201).body("data.remainingAttempts", equalTo(1));
        startRun(member).then().statusCode(201).body("data.remainingAttempts", equalTo(0));
        startRun(member)
                .then()
                .statusCode(409)
                .body("error.code", equalTo("MINIGAME_ATTEMPT_LIMIT_EXCEEDED"));
        withToken(member)
                .when()
                .get("/events/pepero-day")
                .then()
                .body("data.remainingAttempts", equalTo(0));
    }

    @DisplayName("차례가 아닌 막대, 다른 회원의 판, 막대 밖 위치는 자를 수 없다.")
    @Test
    void rejectsInvalidCuts() {
        // Given
        Member owner = saveMember("모카", "pepero-cut-owner");
        Member other = saveMember("하루", "pepero-cut-other");
        long runId = startRun(owner).then().statusCode(201).extract().jsonPath().getLong("data.runId");

        // When & Then
        cut(owner, runId, 2, 6)
                .then()
                .statusCode(409)
                .body("error.code", equalTo("MINIGAME_ROUND_CONFLICT"));
        cut(other, runId, 1, 6)
                .then()
                .statusCode(404)
                .body("error.code", equalTo("MINIGAME_RUN_NOT_FOUND"));
        cut(owner, runId, 1, 12.5)
                .then()
                .statusCode(400)
                .body("error.code", equalTo("INVALID_PARAMETER"));
        cut(owner, runId, 1, 6).then().statusCode(200);
        cut(owner, runId, 1, 6)
                .then()
                .statusCode(409)
                .body("error.code", equalTo("MINIGAME_ROUND_CONFLICT"));
    }

    private void finishRun(Member member, boolean perfect) {
        JsonPath started = startRun(member).then().statusCode(201).extract().jsonPath();
        long runId = started.getLong("data.runId");
        Map<String, Object> stick = started.getMap("data.stick");
        for (int round = 1; round <= 5; round++) {
            double position = perfect ? puzzleFrom(stick).answerPosition() : 0.1;
            stick = cut(member, runId, round, position).then().statusCode(200).extract().jsonPath()
                    .getMap("data.nextStick");
        }
    }

    @SuppressWarnings("unchecked")
    private static StickPuzzle puzzleFrom(Map<String, Object> stick) {
        List<ChocolateLevel> cells = ((List<String>) stick.get("cells")).stream()
                .map(ChocolateLevel::valueOf)
                .toList();
        List<Almond> almonds = ((List<Map<String, Object>>) stick.get("almonds")).stream()
                .map(almond -> Almond.of((Integer) almond.get("cell"), AlmondSize.valueOf((String) almond.get("size"))))
                .toList();
        return StickPuzzle.of(cells, almonds, ((Number) stick.get("startPosition")).doubleValue());
    }

    private Response startRun(Member member) {
        return authorized(member)
                .when()
                .post("/events/pepero-day/runs");
    }

    private Response cut(Member member, long runId, int round, double position) {
        return authorized(member)
                .contentType("application/json")
                .body(Map.of("round", round, "position", position))
                .when()
                .post("/events/pepero-day/runs/{runId}/cuts", runId);
    }

    private Member saveMember(String nickname, String githubId) {
        return memberRepository.save(Member.create(nickname, 8, githubId, Course.BACKEND));
    }

    private RequestSpecification withToken(Member member) {
        return given().cookie(authCookieProperties.accessTokenName(), token(member));
    }

    private RequestSpecification authorized(Member member) {
        String csrfToken = csrfToken();
        return given()
                .cookie(authCookieProperties.accessTokenName(), token(member))
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken);
    }

    private String token(Member member) {
        return accessTokenProvider.issue(member.getId()).value();
    }

    private String csrfToken() {
        return given()
                .when()
                .get("/events/pepero-day")
                .then()
                .extract()
                .cookie("XSRF-TOKEN");
    }
}

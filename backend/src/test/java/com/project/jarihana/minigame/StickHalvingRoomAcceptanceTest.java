package com.project.jarihana.minigame;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
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
import org.springframework.test.context.TestPropertySource;

/**
 * 테스트 시각(2026-08-19 10:00)에 이벤트는 이미 끝나고 게임방으로 옮겨 간 상태로 둔다.
 */
@TestPropertySource(properties = {
        "jarihana.minigame.pepero-day.opens-at=2026-08-18T00:00:00",
        "jarihana.minigame.pepero-day.closes-at=2026-08-19T05:00:00",
        "jarihana.minigame.pepero-day.game-room-opens-at=2026-08-19T09:00:00"
})
class StickHalvingRoomAcceptanceTest extends IntegrationTestSupport {

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("게임방으로 옮긴 뒤에는 이벤트 순위 도전은 막히고, 게임방 순위 도전은 횟수 제한 없이 시작한다.")
    @Test
    void startsUnlimitedRunsInGameRoomOnly() {
        // Given
        Member member = saveMember("모카", "room-unlimited-member");

        // When & Then
        given().when().get("/events/pepero-day").then()
                .body("data.status", equalTo("CLOSED"))
                .body("data.gameRoomOpen", equalTo(true));
        authorized(member).when().post("/events/pepero-day/runs").then()
                .statusCode(409)
                .body("error.code", equalTo("MINIGAME_EVENT_NOT_OPEN"));
        for (int attempt = 0; attempt < 12; attempt++) {
            startRoomRun(member).then()
                    .statusCode(201)
                    .body("data.round", equalTo(1))
                    .body("data.remainingAttempts", nullValue())
                    .body("data.attemptsRefillAt", nullValue());
        }
    }

    @DisplayName("게임방에서 끝낸 판은 게임방 순위에만 오르고, 이벤트 순위와 섞이지 않는다.")
    @Test
    void ranksGameRoomRunsSeparately() {
        // Given
        Member member = saveMember("모카", "room-ranking-member");
        JsonPath started = startRoomRun(member).then().statusCode(201).extract().jsonPath();
        long runId = started.getLong("data.runId");
        Map<String, Object> stick = started.getMap("data.stick");

        // When
        for (int round = 1; round <= 5; round++) {
            roomCut(member, runId, round, puzzleFrom(stick).answerPosition())
                    .then().statusCode(200).body("data.score", equalTo(1000));
            if (round < 5) {
                stick = roomIssueRound(member, runId, round + 1).then().statusCode(200)
                        .extract().jsonPath().getMap("data.stick");
            }
        }

        // Then
        withToken(member).when().get("/games/stick-halving/rankings").then()
                .statusCode(200)
                .body("data.items", hasSize(1))
                .body("data.items[0].nickname", equalTo("모카"))
                .body("data.items[0].totalScore", equalTo(5000))
                .body("data.me.rank", equalTo(1));
        given().when().get("/events/pepero-day/rankings").then()
                .statusCode(200)
                .body("data.items", hasSize(0));
    }

    @DisplayName("게임방 판은 이벤트 경로로 자를 수 없고, 남의 판도 자를 수 없다.")
    @Test
    void keepsRunsOnTheirOwnBoard() {
        // Given
        Member owner = saveMember("모카", "room-owner");
        Member other = saveMember("하루", "room-other");
        long runId = startRoomRun(owner).then().statusCode(201).extract().jsonPath().getLong("data.runId");

        // When & Then
        authorized(owner)
                .contentType("application/json")
                .body(Map.of("round", 1, "position", 6))
                .when()
                .post("/events/pepero-day/runs/{runId}/cuts", runId)
                .then()
                .statusCode(404)
                .body("error.code", equalTo("MINIGAME_RUN_NOT_FOUND"));
        roomCut(other, runId, 1, 6).then()
                .statusCode(404)
                .body("error.code", equalTo("MINIGAME_RUN_NOT_FOUND"));
        roomCut(owner, runId, 1, 6).then().statusCode(200);
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

    private Response startRoomRun(Member member) {
        return authorized(member).when().post("/games/stick-halving/runs");
    }

    private Response roomIssueRound(Member member, long runId, int round) {
        return authorized(member)
                .contentType("application/json")
                .body(Map.of("round", round))
                .when()
                .post("/games/stick-halving/runs/{runId}/rounds", runId);
    }

    private Response roomCut(Member member, long runId, int round, double position) {
        return authorized(member)
                .contentType("application/json")
                .body(Map.of("round", round, "position", position))
                .when()
                .post("/games/stick-halving/runs/{runId}/cuts", runId);
    }

    private Member saveMember(String nickname, String githubId) {
        return memberRepository.save(Member.create(nickname, 8, githubId, Course.BACKEND));
    }

    private RequestSpecification withToken(Member member) {
        return given().cookie(authCookieProperties.accessTokenName(), token(member));
    }

    private RequestSpecification authorized(Member member) {
        String csrfToken = given().when().get("/games/stick-halving/rankings").then().extract().cookie("XSRF-TOKEN");
        return given()
                .cookie(authCookieProperties.accessTokenName(), token(member))
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken);
    }

    private String token(Member member) {
        return accessTokenProvider.issue(member.getId()).value();
    }
}

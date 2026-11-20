package com.project.jarihana.chairstack;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.specification.RequestSpecification;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ChairStackAcceptanceTest extends IntegrationTestSupport {

    private static final String ROOT = "/games/chair-stack";
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired JdbcTemplate jdbc;

    @Test
    void anonymousPlayerCanPlayRecoverAndRankWithoutAnAccount() {
        var browser = guest();
        String start = start(browser, "민트의자");
        var first = dropBody(browser, start, 0, 0);
        request(browser).body(first).post(ROOT + "/drops").then().statusCode(200)
                .body("data.run.placements", hasSize(1));
        request(browser).body(first).post(ROOT + "/drops").then().statusCode(200)
                .body("data.run.placements", hasSize(1));
        request(browser).get(ROOT + "/runs/current").then().statusCode(200).body("data.run.id", equalTo(start))
                .body("data.run.placements", hasSize(1));
        finish(browser, start, 1);

        given().get(ROOT + "/rankings").then().statusCode(200).body("data.items[0].score", equalTo(1))
                .body("data.items[0].guest", equalTo(true)).body("data.me", nullValue());
        request(browser).get(ROOT + "/rankings").then().statusCode(200)
                .body("data.me.nickname", equalTo("민트의자")).body("data.me.rank", equalTo(1));
    }

    @Test
    void physicalChairsUseTheServerPieceAndKeepTheirSettledPoseOnReload() {
        var browser = guest();
        String run = start(browser, "방향의자");
        var before = request(browser).get(ROOT + "/runs/current").then().statusCode(200).extract().jsonPath();
        var assigned = before.getMap("data.run.physics.active");
        var preview = before.getMap("data.run.physics.preview");

        var move = new java.util.HashMap<>(dropBody(browser, run, 0, 0));
        move.remove("phaseMs");
        move.put("orientation", 9);
        var after = request(browser).body(move).post(ROOT + "/drops").then().statusCode(200)
                .body("data.run.physics.chairs[0].piece", equalTo(assigned))
                .body("data.run.physics.active", equalTo(preview))
                .extract().jsonPath();
        assertThat(after.getList("data.frames")).hasSizeGreaterThan(2);
        assertThat(after.getDouble("data.frames[0].poses[0].angle"))
                .isEqualTo(((Number) assigned.get("angle")).doubleValue(), org.assertj.core.data.Offset.offset(0.0001));
        request(browser).get(ROOT + "/runs/current").then().statusCode(200)
                .body("data.run.physics.chairs[0].pose", equalTo(after.getMap("data.run.physics.chairs[0].pose")))
                .body("data.run.physics.active", equalTo(preview));
    }

    @Test
    void physicsDropAppliesTheChosenAngleAndPreservesTheReflectionOnReload() {
        var browser = guest();
        String run = start(browser, "반전의자");
        boolean mirrored = !request(browser).get(ROOT + "/runs/current").then().statusCode(200)
                .extract().jsonPath().getBoolean("data.run.physics.active.mirror");
        var move = new HashMap<>(dropBody(browser, run, 0, 0));
        move.put("adjustment", Map.of("angleDegrees", 9, "mirrored", mirrored));

        var after = request(browser).body(move).post(ROOT + "/drops").then().statusCode(200)
                .body("data.run.placements", hasSize(1))
                .body("data.run.physics.chairs[0].piece.mirror", equalTo(mirrored))
                .extract().jsonPath();
        assertThat(after.getDouble("data.frames[0].poses[0].angle"))
                .isEqualTo(Math.toRadians(-9), org.assertj.core.data.Offset.offset(0.0001));

        request(browser).get(ROOT + "/runs/current").then().statusCode(200)
                .body("data.run.physics.chairs[0].piece.mirror", equalTo(mirrored))
                .body("data.run.physics.chairs[0].pose", equalTo(after.getMap("data.run.physics.chairs[0].pose")));
    }

    @Test
    void tiedGuestsWithTheSameNicknameKeepSeparatePersonalBests() {
        var first = guest();
        var second = guest();
        finish(first, start(first, "자리"), 0);
        finish(second, start(second, "자리"), 0);

        String cursor = request(second).get(ROOT + "/rankings?size=1").then().statusCode(200)
                .body("data.items", hasSize(1)).body("data.items[0].rank", equalTo(1))
                .body("data.me.rank", equalTo(1)).body("data.hasNext", equalTo(true))
                .extract().path("data.nextCursor");
        given().queryParam("size", 1).queryParam("cursor", cursor).get(ROOT + "/rankings")
                .then().statusCode(200).body("data.items", hasSize(1)).body("data.items[0].rank", equalTo(1))
                .body("data.nextCursor", nullValue());

        jdbc.update("update chair_stack_player set started_at = started_at - interval '2 seconds'");
        String oldRun = request(first).get(ROOT + "/runs/current").path("data.run.id");
        String newRun = request(first).body(Map.of("member", false, "nickname", "새닉네임",
                        "previousRunId", oldRun, "requestId", UUID.randomUUID()))
                .post(ROOT + "/runs").then().statusCode(200).extract().path("data.run.id");
        finish(first, newRun, 0);
        request(first).get(ROOT + "/rankings").then().statusCode(200)
                .body("data.items", hasSize(2)).body("data.me.nickname", equalTo("자리"));
    }

    @Test
    void writesRequireCsrfAndOnlyTheOwnerCanPlaceChairs() {
        var owner = guest();
        var other = guest();
        String run = start(owner, "민트의자");

        given().contentType("application/json").cookie("chairStackGuest", owner.guest())
                .body(dropBody(owner, run, 0, 0)).post(ROOT + "/drops").then().statusCode(403);
        request(other).body(dropBody(other, run, 0, 0)).post(ROOT + "/drops").then().statusCode(404)
                .body("error.code", equalTo("CHAIR_STACK_RUN_NOT_FOUND"));
        request(owner).body(dropBody(owner, run, 0, 19)).post(ROOT + "/drops").then().statusCode(400);
        request(owner).body(Map.of("member", true, "requestId", UUID.randomUUID()))
                .post(ROOT + "/runs").then().statusCode(401);
    }

    @Test
    void onlyOneOfTwoConcurrentMovesForTheSameTurnIsAccepted() throws Exception {
        var browser = guest();
        String run = start(browser, "민트의자");
        try (var executor = Executors.newFixedThreadPool(2)) {
            var gate = new CountDownLatch(1);
            var first = executor.submit(() -> {
                gate.await();
                return request(browser).body(dropBody(browser, run, 0, -1)).post(ROOT + "/drops").statusCode();
            });
            var second = executor.submit(() -> {
                gate.await();
                return request(browser).body(dropBody(browser, run, 0, 1)).post(ROOT + "/drops").statusCode();
            });
            gate.countDown();
            assertThat(new int[] {first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)})
                    .containsExactlyInAnyOrder(200, 409);
        }
    }

    @Test
    void membersUseTheirAccountAndServiceNickname() {
        long id = members.save(Member.create("해솔", 23, "41001", Course.BACKEND)).getId();
        String token = tokens.issue(id).value();
        var initial = given().cookie(cookies.accessTokenName(), token).get(ROOT + "/runs/current");
        assertThat(initial.cookie("chairStackGuest")).isNull();
        var member = new Browser(initial.cookie("XSRF-TOKEN"), null, token);
        String run = start(member, "입력값");
        finish(member, run, 0);
        request(member).get(ROOT + "/rankings").then().statusCode(200)
                .body("data.me.nickname", equalTo("해솔")).body("data.me.guest", equalTo(false));
    }

    private Browser guest() {
        var response = given().get(ROOT + "/runs/current");
        response.then().statusCode(200).body("data.guest", equalTo(true)).body("data.run", nullValue());
        assertThat(response.getDetailedCookie("chairStackGuest").isHttpOnly()).isTrue();
        return new Browser(response.cookie("XSRF-TOKEN"), response.cookie("chairStackGuest"), null);
    }

    private String start(Browser browser, String nickname) {
        return request(browser).body(Map.of("member", browser.member(), "nickname", nickname,
                        "requestId", UUID.randomUUID()))
                .post(ROOT + "/runs").then().statusCode(200).extract().path("data.run.id");
    }

    private void finish(Browser browser, String run, int turn) {
        if (turn == 0) {
            request(browser).body(dropBody(browser, run, 0, 0)).post(ROOT + "/drops")
                    .then().statusCode(200);
        }
        request(browser).body(dropBody(browser, run, 1, 18)).post(ROOT + "/drops")
                .then().statusCode(200).body("data.run.finished", equalTo(true)).body("data.bestScore", equalTo(1));
    }

    private Map<String, Object> dropBody(Browser browser, String run, int turn, int x) {
        return Map.of("member", browser.member(), "runId", run, "turn", turn,
                "x", x, "phaseMs", 0, "requestId", UUID.randomUUID());
    }

    private RequestSpecification request(Browser browser) {
        var request = given().contentType("application/json")
                .cookie("XSRF-TOKEN", browser.csrf()).header("X-XSRF-TOKEN", browser.csrf());
        if (browser.member()) {
            return request.cookie(cookies.accessTokenName(), browser.accessToken());
        }
        return request.cookie("chairStackGuest", browser.guest());
    }

    private record Browser(String csrf, String guest, String accessToken) {
        boolean member() {
            return accessToken != null;
        }
    }
}

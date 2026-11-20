package com.project.jarihana.gomoku;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.GithubOAuthClientStub;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.Map;

class GomokuInvitationAuthAcceptanceTest extends IntegrationTestSupport {
    private static final String ROOT = "/games/gomoku/rooms";
    @Autowired MemberRepository members;
    @Autowired AccessTokenProvider tokens;
    @Autowired AuthCookieProperties cookies;
    @Autowired AuthProperties authProperties;
    @Autowired GithubOAuthClientStub github;

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    @DisplayName("익명 초대 미리보기 후 기존 회원 로그인 또는 신규 가입을 마쳐도 직접 참여 전에는 입장하지 않는다")
    void entersInvitationOnlyAfterAuthenticationAndExplicitJoin(boolean registered) {
        // Given
        long hostId = members.save(Member.create("가을", 23, "invite-auth-host", Course.BACKEND)).getId();
        String host = tokens.issue(hostId).value();
        long roomId = request(host)
                .body(Map.of("visibility", "PRIVATE", "rule", "RENJU"))
                .post(ROOT).then().statusCode(201).extract().jsonPath().getLong("data.roomId");
        String invitation = request(host).post(ROOT + "/" + roomId + "/invite")
                .then().statusCode(200).extract().path("data.token");
        String githubId = "invite-auth-guest";
        if (registered) members.save(Member.create("봄날", 23, githubId, Course.FRONTEND));
        github.willReturn(githubId);

        // When / Then
        request(null).get("/games/gomoku/invitations/" + invitation)
                .then().statusCode(200).body("data.id", equalTo((int) roomId));
        request(null).body(Map.of("token", invitation)).post(ROOT + "/" + roomId + "/join")
                .then().statusCode(401);
        var callback = given().redirects().follow(false)
                .cookie(authProperties.oauthStateCookieName(), "invitation-auth-state")
                .queryParam("state", "invitation-auth-state")
                .queryParam("code", "invitation-auth-code")
                .get("/oauth/github/callback").then().statusCode(302).extract();
        String access = callback.cookie(cookies.accessTokenName());
        if (!registered) {
            String session = callback.cookie("SESSION");
            assertNotNull(session);
            request(null).cookie("SESSION", session).get("/members/me")
                    .then().statusCode(200).body("data.signupCompleted", equalTo(false));
            request(null).cookie("SESSION", session)
                    .body(Map.of("token", invitation)).post(ROOT + "/" + roomId + "/join")
                    .then().statusCode(401);
            access = request(null).cookie("SESSION", session)
                    .body(Map.of("crewName", "여울", "generation", 23, "course", "FRONTEND", "memberType", "CREW"))
                    .post("/members").then().statusCode(201).extract().cookie(cookies.accessTokenName());
        }
        assertNotNull(access);
        request(access).get("/members/me").then().statusCode(200).body("data.signupCompleted", equalTo(true));
        request(access).get(ROOT + "/me").then().statusCode(200).body("data.roomId", nullValue());
        request(access).get("/games/gomoku/invitations/" + invitation)
                .then().statusCode(200).body("data.guestName", nullValue());
        request(access).body(Map.of("token", invitation)).post(ROOT + "/" + roomId + "/join")
                .then().statusCode(200);
        request(access).get(ROOT + "/me").then().body("data.roomId", equalTo((int) roomId));
        request(access).get(ROOT + "/" + roomId).then().statusCode(200).body("data.status", equalTo("WAITING"));
    }

    private RequestSpecification request(String token) {
        String csrf = given().get("/groups?size=1").cookie("XSRF-TOKEN");
        var request = given().contentType("application/json")
                .cookie("XSRF-TOKEN", csrf).header("X-XSRF-TOKEN", csrf);
        return token == null ? request : request.cookie(cookies.accessTokenName(), token);
    }
}

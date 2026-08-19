package com.project.jarihana.member.command.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.RefreshToken;
import com.project.jarihana.member.repository.MemberRepository;
import com.project.jarihana.member.repository.RefreshTokenRepository;
import com.project.jarihana.support.GithubOAuthClientStub;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.http.Cookie;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

class GithubOAuthCallbackAcceptanceTest extends IntegrationTestSupport {

    private static final String CALLBACK_PATH = "/api/oauth/github/callback";
    private static final String SESSION_COOKIE_NAME = "SESSION";
    private static final String REFRESH_COOKIE_NAME = "refreshToken";
    private static final String ISSUED_STATE = "issued-state-value";
    private static final String GITHUB_ID = "123456";

    @Autowired
    private GithubOAuthClientStub githubOAuthClient;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private SessionRepository<? extends Session> sessionRepository;

    @DisplayName("가입하지 않은 GitHub 사용자는 가입 세션에 githubId를 남기고 가입 화면으로 이동한다.")
    @Test
    void redirectUnregisteredUserToSignup() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);
        String sessionId = seedSessionWithState(ISSUED_STATE);

        // When
        ExtractableResponse<Response> response = callback(sessionId, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FOUND.value());
        assertThat(response.header(HttpHeaders.LOCATION))
                .isEqualTo("http://localhost:5173/oauth/callback?signupRequired=true");
        assertThat(response.cookie(REFRESH_COOKIE_NAME)).isNull();
        assertThat(sessionAttribute(sessionId, OAuthSessionAttributes.SIGNUP_GITHUB_ID)).isEqualTo(GITHUB_ID);
        assertThat(refreshTokenRepository.findAll()).isEmpty();
    }

    @DisplayName("가입한 회원은 Refresh Token 쿠키를 받고 서비스 화면으로 이동한다.")
    @Test
    void redirectRegisteredMemberWithRefreshToken() {
        // Given
        memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        githubOAuthClient.willReturn(GITHUB_ID);
        String sessionId = seedSessionWithState(ISSUED_STATE);

        // When
        ExtractableResponse<Response> response = callback(sessionId, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FOUND.value());
        assertThat(response.header(HttpHeaders.LOCATION))
                .isEqualTo("http://localhost:5173/oauth/callback?signupRequired=false");
        Cookie refreshCookie = response.detailedCookie(REFRESH_COOKIE_NAME);
        assertThat(refreshCookie.getValue()).isNotBlank();
        assertThat(refreshCookie.isHttpOnly()).isTrue();
        assertThat(refreshCookie.getPath()).isEqualTo("/api/auth");
        assertThat(sessionAttribute(sessionId, OAuthSessionAttributes.SIGNUP_GITHUB_ID)).isNull();
        List<RefreshToken> refreshTokens = refreshTokenRepository.findAll();
        assertThat(refreshTokens).hasSize(1);
        assertThat(refreshTokens.get(0).getTokenHash()).isNotEqualTo(refreshCookie.getValue());
    }

    @DisplayName("인가 코드가 없으면 콜백 요청을 거부한다.")
    @Test
    void rejectCallbackWithoutAuthorizationCode() {
        // Given
        String sessionId = seedSessionWithState(ISSUED_STATE);

        // When
        ExtractableResponse<Response> response = callback(sessionId, null, ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getBoolean("success")).isFalse();
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_INVALID_CALLBACK");
    }

    @DisplayName("발급한 state와 다른 값으로 돌아온 콜백 요청을 거부한다.")
    @Test
    void rejectCallbackWithMismatchedState() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);
        String sessionId = seedSessionWithState(ISSUED_STATE);

        // When
        ExtractableResponse<Response> response = callback(sessionId, "authorization-code", "forged-state");

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_STATE_INVALID");
    }

    @DisplayName("발급한 state가 없는 요청은 거부한다.")
    @Test
    void rejectCallbackWithoutIssuedState() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .redirects().follow(false)
                .queryParam("code", "authorization-code")
                .queryParam("state", ISSUED_STATE)
                .when()
                .get(CALLBACK_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_STATE_INVALID");
    }

    @DisplayName("GitHub 사용자 조회에 실패하면 502로 응답한다.")
    @Test
    void respondBadGatewayWhenGithubLookupFails() {
        // Given
        githubOAuthClient.willFail();
        String sessionId = seedSessionWithState(ISSUED_STATE);

        // When
        ExtractableResponse<Response> response = callback(sessionId, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_GATEWAY.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_PROVIDER_ERROR");
    }

    @DisplayName("한 번 사용한 state로는 다시 콜백을 처리할 수 없다.")
    @Test
    void rejectReusedState() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);
        String sessionId = seedSessionWithState(ISSUED_STATE);
        callback(sessionId, "authorization-code", ISSUED_STATE);

        // When
        ExtractableResponse<Response> response = callback(sessionId, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_STATE_INVALID");
    }

    private ExtractableResponse<Response> callback(String sessionId, String code, String state) {
        RequestSpecification request = RestAssured.given()
                .redirects().follow(false)
                .cookie(SESSION_COOKIE_NAME, encodeSessionCookie(sessionId))
                .queryParam("state", state);
        if (code != null) {
            request = request.queryParam("code", code);
        }
        return request.when()
                .get(CALLBACK_PATH)
                .then()
                .extract();
    }

    private String seedSessionWithState(String state) {
        return createSession(sessionRepository, state);
    }

    private <S extends Session> String createSession(SessionRepository<S> repository, String state) {
        S session = repository.createSession();
        session.setAttribute(OAuthSessionAttributes.OAUTH_STATE, state);
        repository.save(session);
        return session.getId();
    }

    private String sessionAttribute(String sessionId, String attributeName) {
        Session session = sessionRepository.findById(sessionId);
        if (session == null) {
            return null;
        }
        return session.getAttribute(attributeName);
    }

    private String encodeSessionCookie(String sessionId) {
        return Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8));
    }
}

package com.project.jarihana.auth.command.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.support.GithubOAuthClientStub;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;
import org.springframework.web.util.UriComponentsBuilder;

class GithubAuthorizationAcceptanceTest extends IntegrationTestSupport {

    private static final String AUTHORIZATION_PATH = "/api/oauth/github/authorization";
    private static final String CALLBACK_PATH = "/api/oauth/github/callback";
    private static final String SESSION_COOKIE_NAME = "SESSION";
    private static final String GITHUB_ID = "123456";

    @Autowired
    private GithubOAuthClientStub githubOAuthClient;

    @Autowired
    private SessionRepository<? extends Session> sessionRepository;

    @DisplayName("GitHub 인가 페이지로 이동시킨다.")
    @Test
    void redirectToGithubAuthorizePage() {
        // Given

        // When
        ExtractableResponse<Response> response = startAuthorization();

        // Then
        String location = response.header(HttpHeaders.LOCATION);
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FOUND.value());
        assertThat(location).startsWith("https://github.com/login/oauth/authorize");
        assertThat(queryParam(location, "client_id")).isEqualTo("test-client-id");
        assertThat(queryParam(location, "redirect_uri"))
                .isEqualTo("http://localhost:8080/api/oauth/github/callback");
        assertThat(queryParam(location, "state")).isNotBlank();
    }

    @DisplayName("발급한 state를 세션에 보관한다.")
    @Test
    void storeIssuedStateInSession() {
        // Given

        // When
        ExtractableResponse<Response> response = startAuthorization();

        // Then
        String issuedState = queryParam(response.header(HttpHeaders.LOCATION), "state");
        assertThat(sessionAttribute(sessionIdOf(response), OAuthSessionAttributes.OAUTH_STATE))
                .isEqualTo(issuedState);
    }

    @DisplayName("요청마다 다른 state를 발급한다.")
    @Test
    void issueDifferentStatePerRequest() {
        // Given

        // When
        String first = queryParam(startAuthorization().header(HttpHeaders.LOCATION), "state");
        String second = queryParam(startAuthorization().header(HttpHeaders.LOCATION), "state");

        // Then
        assertThat(first).isNotEqualTo(second);
    }

    @DisplayName("인가 시작이 발급한 state로 콜백을 처리할 수 있다.")
    @Test
    void completeCallbackWithIssuedState() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);
        ExtractableResponse<Response> authorization = startAuthorization();
        String issuedState = queryParam(authorization.header(HttpHeaders.LOCATION), "state");

        // When
        ExtractableResponse<Response> callback =
                callback(authorization.cookie(SESSION_COOKIE_NAME), issuedState);

        // Then
        assertThat(callback.statusCode()).isEqualTo(HttpStatus.FOUND.value());
        assertThat(callback.header(HttpHeaders.LOCATION))
                .isEqualTo("http://localhost:5173/oauth/callback?signupRequired=true");
    }

    @DisplayName("한 번 사용한 state로는 콜백을 다시 처리할 수 없다.")
    @Test
    void rejectReusedState() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);
        ExtractableResponse<Response> authorization = startAuthorization();
        String issuedState = queryParam(authorization.header(HttpHeaders.LOCATION), "state");
        String sessionCookie = authorization.cookie(SESSION_COOKIE_NAME);
        callback(sessionCookie, issuedState);

        // When
        ExtractableResponse<Response> retried = callback(sessionCookie, issuedState);

        // Then
        assertThat(retried.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(retried.jsonPath().getString("error.code")).isEqualTo("OAUTH_STATE_INVALID");
    }

    private ExtractableResponse<Response> startAuthorization() {
        return RestAssured.given()
                .redirects().follow(false)
                .when()
                .get(AUTHORIZATION_PATH)
                .then()
                .extract();
    }

    private ExtractableResponse<Response> callback(String sessionCookie, String state) {
        return RestAssured.given()
                .redirects().follow(false)
                .cookie(SESSION_COOKIE_NAME, sessionCookie)
                .queryParam("code", "authorization-code")
                .queryParam("state", state)
                .when()
                .get(CALLBACK_PATH)
                .then()
                .extract();
    }

    private String queryParam(String uri, String name) {
        return UriComponentsBuilder.fromUriString(uri).build().getQueryParams().getFirst(name);
    }

    private String sessionIdOf(ExtractableResponse<Response> response) {
        return new String(
                Base64.getDecoder().decode(response.cookie(SESSION_COOKIE_NAME)),
                StandardCharsets.UTF_8
        );
    }

    private String sessionAttribute(String sessionId, String attributeName) {
        Session session = sessionRepository.findById(sessionId);
        if (session == null) {
            return null;
        }
        return session.getAttribute(attributeName);
    }
}

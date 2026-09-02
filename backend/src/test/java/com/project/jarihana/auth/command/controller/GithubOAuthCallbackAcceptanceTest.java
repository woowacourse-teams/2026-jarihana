package com.project.jarihana.auth.command.controller;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.config.AuthProperties;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.auth.session.SignupSession;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.GithubOAuthClientStub;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.http.Cookie;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 콜백은 프론트엔드가 심은 state 쿠키와 GitHub이 되돌려준 state 쿼리를 대조한다(ADR 0003).
 * 인가 시작은 프론트엔드가 소유하므로 이 테스트는 그 역할을 대신해 쿠키를 직접 보낸다.
 */
class GithubOAuthCallbackAcceptanceTest extends IntegrationTestSupport {

    private static final String CALLBACK_PATH = "/oauth/github/callback";
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

    @Autowired
    private AuthProperties authProperties;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @DisplayName("가입하지 않은 GitHub 사용자는 가입 세션에 githubId를 남기고 가입 화면으로 이동한다.")
    @Test
    void redirectUnregisteredUserToSignup() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FOUND.value());
        assertThat(response.header(HttpHeaders.LOCATION))
                .isEqualTo("http://localhost:5173/oauth/callback?signupRequired=true");
        assertThat(response.cookie(REFRESH_COOKIE_NAME)).isNull();
        assertThat(signupGithubIdOf(response)).isEqualTo(GITHUB_ID);
        assertThat(refreshTokenRepository.findAll()).isEmpty();
    }

    private ExtractableResponse<Response> callback(String stateCookie, String code, String state) {
        RequestSpecification request = RestAssured.given()
                .redirects().follow(false)
                .cookie(authProperties.oauthStateCookieName(), stateCookie)
                .queryParam("state", state);
        if (code != null) {
            request = request.queryParam("code", code);
        }
        return request.when()
                .get(CALLBACK_PATH)
                .then()
                .extract();
    }

    private String signupGithubIdOf(ExtractableResponse<Response> response) {
        String sessionId = new String(
                Base64.getDecoder().decode(response.cookie(SESSION_COOKIE_NAME)),
                StandardCharsets.UTF_8
        );
        Session session = sessionRepository.findById(sessionId);
        if (session == null) {
            return null;
        }
        return session.getAttribute(SignupSession.githubIdAttribute());
    }

    @DisplayName("가입한 회원은 Refresh Token 쿠키를 받고 서비스 화면으로 이동한다.")
    @Test
    void redirectRegisteredMemberWithRefreshToken() {
        // Given
        memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FOUND.value());
        assertThat(response.header(HttpHeaders.LOCATION))
                .isEqualTo("http://localhost:5173/oauth/callback?signupRequired=false");
        Cookie refreshCookie = response.detailedCookie(REFRESH_COOKIE_NAME);
        assertThat(refreshCookie.getValue()).isNotBlank();
        assertThat(refreshCookie.isHttpOnly()).isTrue();
        assertThat(refreshCookie.getPath()).isEqualTo("/api/auth");
        List<RefreshToken> refreshTokens = refreshTokenRepository.findAll();
        assertThat(refreshTokens).hasSize(1);
        assertThat(refreshTokens.get(0).getTokenHash()).isNotEqualTo(refreshCookie.getValue());
    }

    @DisplayName("인가 코드가 없으면 콜백 요청을 거부한다.")
    @Test
    void rejectCallbackWithoutAuthorizationCode() {
        // Given

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, null, ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getBoolean("success")).isFalse();
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_INVALID_CALLBACK");
    }

    @DisplayName("쿠키의 state와 다른 값으로 돌아온 콜백 요청을 거부한다.")
    @Test
    void rejectCallbackWithMismatchedState() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", "forged-state");

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_STATE_INVALID");
    }

    @DisplayName("state 쿠키가 없는 요청은 거부한다.")
    @Test
    void rejectCallbackWithoutStateCookie() {
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

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_GATEWAY.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_PROVIDER_ERROR");
    }

    @DisplayName("처리에 성공하면 state 쿠키를 만료시켜 한 번만 쓰이게 한다.")
    @Test
    void expireStateCookieAfterSuccess() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", ISSUED_STATE);

        // Then
        Cookie stateCookie = response.detailedCookie(authProperties.oauthStateCookieName());
        assertThat(stateCookie.getMaxAge()).isZero();
        assertThat(stateCookie.getValue()).isEmpty();
    }

    @DisplayName("state가 일치하지 않아도 state 쿠키를 만료시킨다.")
    @Test
    void expireStateCookieAfterFailure() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", "forged-state");

        // Then
        Cookie stateCookie = response.detailedCookie(authProperties.oauthStateCookieName());
        assertThat(stateCookie.getMaxAge()).isZero();
    }

    @DisplayName("가입한 회원은 Access Token 쿠키를 함께 받는다.")
    @Test
    void issueAccessTokenCookieToRegisteredMember() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", ISSUED_STATE);

        // Then
        Cookie accessCookie = response.detailedCookie(authCookieProperties.accessTokenName());
        assertThat(accessCookie.getValue()).isNotBlank();
        assertThat(accessCookie.isHttpOnly()).isTrue();
        assertThat(accessCookie.getPath()).isEqualTo(authCookieProperties.accessTokenPath());
        assertThat(accessTokenProvider.parseMemberId(accessCookie.getValue())).isEqualTo(member.getId());
    }

    @DisplayName("가입하지 않은 GitHub 사용자는 Access Token 쿠키를 받지 않는다.")
    @Test
    void notIssueAccessTokenCookieToUnregisteredUser() {
        // Given
        githubOAuthClient.willReturn(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = callback(ISSUED_STATE, "authorization-code", ISSUED_STATE);

        // Then
        assertThat(response.cookie(authCookieProperties.accessTokenName())).isNull();
    }
}

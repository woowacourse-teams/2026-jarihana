package com.project.jarihana.auth.command.controller;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.common.auth.SignupSession;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.http.Cookie;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 로그아웃은 자격 증명 종류에 따라 무효화 대상이 다르다.
 *
 * <p>가입을 마친 회원은 Refresh Token을 폐기하고, GitHub 인증만 끝낸 사용자는 가입 세션을
 * 무효화한다. 어느 쪽도 없을 때만 거부한다.
 */
class AuthLogoutAcceptanceTest extends IntegrationTestSupport {

    private static final String LOGOUT_PATH = "/auth/logout";
    private static final String MY_PROFILE_PATH = "/members/me";
    private static final String SESSION_COOKIE_NAME = "SESSION";
    private static final String CSRF_COOKIE_NAME = "XSRF-TOKEN";
    private static final String CSRF_HEADER_NAME = "X-XSRF-TOKEN";
    private static final String GITHUB_ID = "123456";

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private RefreshTokenIssuer refreshTokenIssuer;

    @Autowired
    private SessionRepository<? extends Session> sessionRepository;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @DisplayName("가입한 회원이 로그아웃하면 Refresh Token을 폐기한다.")
    @Test
    void discardRefreshTokenOnLogout() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = logout(request -> request
                .cookie(authCookieProperties.accessTokenName(), accessTokenOf(member))
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(refreshTokenRepository.findAll()).isEmpty();
    }

    private ExtractableResponse<Response> logout(CredentialSpec credentials) {
        String csrfToken = issueCsrfToken();
        RequestSpecification request = RestAssured.given()
                .cookie(CSRF_COOKIE_NAME, csrfToken)
                .header(CSRF_HEADER_NAME, csrfToken);
        return credentials.apply(request)
                .when()
                .post(LOGOUT_PATH)
                .then()
                .extract();
    }

    private String issueCsrfToken() {
        return RestAssured.given()
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract()
                .cookie(CSRF_COOKIE_NAME);
    }

    private String accessTokenOf(Member member) {
        return accessTokenProvider.issue(member.getId()).value();
    }

    @DisplayName("로그아웃 응답은 자격 증명 쿠키를 만료시킨다.")
    @Test
    void expireCredentialCookiesOnLogout() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = logout(request -> request
                .cookie(authCookieProperties.accessTokenName(), accessTokenOf(member))
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        Cookie accessCookie = response.detailedCookie(authCookieProperties.accessTokenName());
        Cookie refreshCookie = response.detailedCookie(authCookieProperties.refreshTokenName());
        assertThat(accessCookie.getMaxAge()).isZero();
        assertThat(accessCookie.getValue()).isEmpty();
        assertThat(refreshCookie.getMaxAge()).isZero();
        assertThat(refreshCookie.getValue()).isEmpty();
    }

    @DisplayName("다른 회원의 Refresh Token은 폐기하지 않는다.")
    @Test
    void keepRefreshTokenOfOtherMember() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        Member other = memberRepository.save(Member.create("우주", 8, "other-github-id", Course.FRONTEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();
        refreshTokenIssuer.issue(other);

        // When
        logout(request -> request
                .cookie(authCookieProperties.accessTokenName(), accessTokenOf(member))
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        assertThat(refreshTokenRepository.findAll()).hasSize(1);
        assertThat(refreshTokenRepository.findAll().get(0).getMember().getId()).isEqualTo(other.getId());
    }

    @DisplayName("가입 세션만 있는 사용자가 로그아웃하면 가입 세션을 무효화한다.")
    @Test
    void invalidateSignupSessionOnLogout() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = logout(request -> request
                .cookie(SESSION_COOKIE_NAME, encodeSessionCookie(sessionId)));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.NO_CONTENT.value());
        assertThat(sessionRepository.findById(sessionId)).isNull();
    }

    private String createSignupSession(String githubId) {
        return storeSignupGithubId(sessionRepository, githubId);
    }

    private <S extends Session> String storeSignupGithubId(SessionRepository<S> repository, String githubId) {
        S session = repository.createSession();
        session.setAttribute(SignupSession.githubIdAttribute(), githubId);
        repository.save(session);
        return session.getId();
    }

    private String encodeSessionCookie(String sessionId) {
        return Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8));
    }

    @DisplayName("자격 증명이 없으면 거부한다.")
    @Test
    void rejectLogoutWithoutCredentials() {
        // Given

        // When
        ExtractableResponse<Response> response = logout(request -> request);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @DisplayName("저장소에 없는 Refresh Token만 보내면 거부한다.")
    @Test
    void rejectLogoutWithUnknownRefreshToken() {
        // Given

        // When
        ExtractableResponse<Response> response = logout(request -> request
                .cookie(authCookieProperties.refreshTokenName(), "unknown-refresh-token"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @DisplayName("CSRF 토큰이 없는 로그아웃 요청은 거부한다.")
    @Test
    void rejectLogoutWithoutCsrfToken() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenOf(member))
                .when()
                .post(LOGOUT_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }

    @FunctionalInterface
    private interface CredentialSpec {

        RequestSpecification apply(RequestSpecification request);
    }
}

package com.project.jarihana.member.query.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.common.auth.SignupSession;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.session.Session;
import org.springframework.session.SessionRepository;

/**
 * 내 정보 조회는 자격 증명 경로가 두 개다.
 *
 * <p>가입을 마친 회원은 Access Token 쿠키를 쓰고, GitHub 인증만 끝낸 사용자는 아직 회원이
 * 아니므로 콜백이 남긴 가입 세션을 쓴다. 둘 다 없을 때만 거부한다.
 */
class MemberMyProfileAcceptanceTest extends IntegrationTestSupport {

    private static final String MY_PROFILE_PATH = "/members/me";
    private static final String SESSION_COOKIE_NAME = "SESSION";
    private static final String GITHUB_ID = "123456";

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private SessionRepository<? extends Session> sessionRepository;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @DisplayName("가입을 마친 회원은 Access Token으로 자신의 정보를 조회한다.")
    @Test
    void respondProfileToRegisteredMember() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenOf(member))
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.jsonPath().getBoolean("success")).isTrue();
        assertThat(response.jsonPath().getBoolean("data.signupCompleted")).isTrue();
        assertThat(response.jsonPath().getLong("data.member.id")).isEqualTo(member.getId());
        assertThat(response.jsonPath().getString("data.member.crewName")).isEqualTo("가온");
        assertThat(response.jsonPath().getInt("data.member.generation")).isEqualTo(8);
        assertThat(response.jsonPath().getString("data.member.course")).isEqualTo("BACKEND");
        assertThat(response.jsonPath().getString("data.member.avatarUrl"))
                .isEqualTo("https://avatars.githubusercontent.com/u/" + GITHUB_ID);
        assertThat((Object) response.jsonPath().get("error")).isNull();
    }

    @DisplayName("가입 세션만 있는 사용자는 가입 전 상태로 응답한다.")
    @Test
    void respondSignupRequiredToSessionOnlyUser() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(SESSION_COOKIE_NAME, encodeSessionCookie(sessionId))
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.jsonPath().getBoolean("data.signupCompleted")).isFalse();
        assertThat((Object) response.jsonPath().get("data.member")).isNull();
    }

    @DisplayName("가입 세션이 있어도 가입을 마쳤다면 회원 정보를 준다.")
    @Test
    void preferMemberProfileWhenBothCredentialsExist() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessTokenOf(member))
                .cookie(SESSION_COOKIE_NAME, encodeSessionCookie(sessionId))
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.jsonPath().getBoolean("data.signupCompleted")).isTrue();
        assertThat(response.jsonPath().getLong("data.member.id")).isEqualTo(member.getId());
    }

    @DisplayName("자격 증명이 없으면 거부한다.")
    @Test
    void rejectRequestWithoutCredentials() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getBoolean("success")).isFalse();
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @DisplayName("가입 세션 없이 유효하지 않은 Access Token만 있으면 거부한다.")
    @Test
    void rejectRequestWithInvalidAccessToken() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), "not-a-json-web-token")
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @DisplayName("탈퇴했거나 존재하지 않는 회원을 가리키는 Access Token은 거부한다.")
    @Test
    void rejectAccessTokenPointingToMissingMember() {
        // Given
        String accessToken = accessTokenProvider.issue(999_999L).value();

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    private String accessTokenOf(Member member) {
        return accessTokenProvider.issue(member.getId()).value();
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
}

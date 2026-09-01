package com.project.jarihana.member.command.controller;

import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.common.auth.SignupSession;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.http.ContentType;
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
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 가입 완료는 Request Body가 아니라 가입 세션의 githubId로 회원을 만든다.
 *
 * <p>가입 세션은 쿠키 자격 증명이므로 상태를 바꾸는 이 요청에는 CSRF 토큰이 필요하다.
 * 프론트엔드가 하듯 응답으로 받은 XSRF-TOKEN 쿠키를 헤더에 다시 실어 보낸다.
 */
class MemberSignupAcceptanceTest extends IntegrationTestSupport {

    private static final String SIGNUP_PATH = "/members";
    private static final String MY_PROFILE_PATH = "/members/me";
    private static final String SESSION_COOKIE_NAME = "SESSION";
    private static final String CSRF_COOKIE_NAME = "XSRF-TOKEN";
    private static final String CSRF_HEADER_NAME = "X-XSRF-TOKEN";
    private static final String GITHUB_ID = "123456";

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private SessionRepository<? extends Session> sessionRepository;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @DisplayName("가입 세션의 GitHub 사용자로 회원 가입을 완료한다.")
    @Test
    void completeSignup() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온", 8, "BACKEND"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getBoolean("success")).isTrue();
        Long id = response.jsonPath().getLong("data.id");
        assertThat(response.header(HttpHeaders.LOCATION)).endsWith("/members/" + id);
        assertThat(response.jsonPath().getString("data.crewName")).isEqualTo("가온");
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("CREW");
        assertThat(response.jsonPath().getInt("data.generation")).isEqualTo(8);
        assertThat(response.jsonPath().getString("data.course")).isEqualTo("BACKEND");
        assertThat(response.jsonPath().getString("data.joinedAt")).isNotBlank();
        assertThat(memberRepository.findByGithubId(GITHUB_ID)).isPresent();
    }

    @DisplayName("코치는 기수 없이 가입할 수 있다.")
    @Test
    void completeCoachSignupWithoutGeneration() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(
                sessionId,
                Map.of("crewName", "코치", "memberType", "COACH")
        );

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("COACH");
        assertThat((Object) response.jsonPath().get("data.course")).isNull();
        assertThat((Object) response.jsonPath().get("data.generation")).isNull();
        assertThat(memberRepository.findByGithubId(GITHUB_ID)).get().extracting(Member::getGeneration).isNull();
    }

    @DisplayName("코치끼리 같은 이름을 사용할 수 없다.")
    @Test
    void rejectDuplicatedCoachName() {
        // Given
        memberRepository.save(Member.create("코치", null, "other-github-id", MemberType.COACH, null));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(
                sessionId,
                Map.of("crewName", "코치", "memberType", "COACH")
        );

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    @DisplayName("코치 이름은 크루 이름과 중복될 수 없다.")
    @Test
    void rejectCoachNameDuplicatedWithCrewName() {
        // Given
        memberRepository.save(Member.create("코치", 8, "other-github-id", Course.FRONTEND));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(
                sessionId,
                Map.of("crewName", "코치", "memberType", "COACH")
        );

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    @DisplayName("크루 이름은 코치 이름과 중복될 수 없다.")
    @Test
    void rejectCrewNameDuplicatedWithCoachName() {
        // Given
        memberRepository.save(Member.create("코치", null, "other-github-id", MemberType.COACH, null));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(
                sessionId,
                body("코치", 8, "BACKEND")
        );

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    private Map<String, Object> body(String crewName, int generation, String course) {
        return Map.of(
                "crewName", crewName,
                "generation", generation,
                "course", course,
                "memberType", "CREW"
        );
    }

    private ExtractableResponse<Response> signup(String sessionId, Map<String, Object> body) {
        String csrfToken = issueCsrfToken();
        RequestSpecification request = RestAssured.given()
                .contentType(ContentType.JSON)
                .cookie(CSRF_COOKIE_NAME, csrfToken)
                .header(CSRF_HEADER_NAME, csrfToken)
                .body(body);
        if (sessionId != null) {
            request = request.cookie(SESSION_COOKIE_NAME, encodeSessionCookie(sessionId));
        }
        return request.when()
                .post(SIGNUP_PATH)
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

    private String encodeSessionCookie(String sessionId) {
        return Base64.getEncoder().encodeToString(sessionId.getBytes(StandardCharsets.UTF_8));
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

    @DisplayName("가입을 마치면 이후 API에서 쓸 토큰 쿠키를 받는다.")
    @Test
    void issueTokenCookiesAfterSignup() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온", 8, "BACKEND"));

        // Then
        Cookie accessCookie = response.detailedCookie(authCookieProperties.accessTokenName());
        Cookie refreshCookie = response.detailedCookie(authCookieProperties.refreshTokenName());
        assertThat(accessCookie.isHttpOnly()).isTrue();
        assertThat(accessTokenProvider.parseMemberId(accessCookie.getValue()))
                .isEqualTo(response.jsonPath().getLong("data.id"));
        assertThat(refreshCookie.getValue()).isNotBlank();
        assertThat(refreshCookie.isHttpOnly()).isTrue();
        assertThat(refreshCookie.getPath()).isEqualTo(authCookieProperties.refreshTokenPath());
    }

    @DisplayName("가입을 마치면 발급받은 Access Token으로 내 정보를 조회할 수 있다.")
    @Test
    void useIssuedAccessTokenAfterSignup() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);
        ExtractableResponse<Response> signup = signup(sessionId, body("가온", 8, "BACKEND"));

        // When
        ExtractableResponse<Response> myProfile = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), signup.cookie(authCookieProperties.accessTokenName()))
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract();

        // Then
        assertThat(myProfile.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(myProfile.jsonPath().getBoolean("data.signupCompleted")).isTrue();
        assertThat(myProfile.jsonPath().getString("data.member.crewName")).isEqualTo("가온");
    }

    @DisplayName("가입 세션이 없으면 거부한다.")
    @Test
    void rejectSignupWithoutSignupSession() {
        // Given

        // When
        ExtractableResponse<Response> response = signup(null, body("가온", 8, "BACKEND"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("SIGNUP_SESSION_REQUIRED");
    }

    @DisplayName("이미 가입한 GitHub 사용자는 거부한다.")
    @Test
    void rejectAlreadyRegisteredGithubUser() {
        // Given
        memberRepository.save(Member.create("우주", 8, GITHUB_ID, Course.BACKEND));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온", 8, "BACKEND"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_ALREADY_EXISTS");
    }

    @DisplayName("같은 기수에 이미 있는 크루명은 거부한다.")
    @Test
    void rejectDuplicatedCrewNameInSameGeneration() {
        // Given
        memberRepository.save(Member.create("가온", 8, "other-github-id", Course.FRONTEND));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온", 8, "BACKEND"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    @DisplayName("다른 기수에서는 같은 크루명을 사용할 수 있다.")
    @Test
    void allowDuplicatedCrewNameInDifferentGeneration() {
        // Given
        memberRepository.save(Member.create("가온", 7, "other-github-id", Course.FRONTEND));
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온", 8, "BACKEND"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
    }

    @DisplayName("크루명 형식이 올바르지 않으면 거부한다.")
    @Test
    void rejectInvalidCrewName() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("crew", 8, "BACKEND"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @DisplayName("지원하지 않는 코스는 거부한다.")
    @Test
    void rejectUnsupportedCourse() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온", 8, "DEVOPS"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @DisplayName("CSRF 토큰이 없는 가입 요청은 거부한다.")
    @Test
    void rejectSignupWithoutCsrfToken() {
        // Given
        String sessionId = createSignupSession(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .contentType(ContentType.JSON)
                .cookie(SESSION_COOKIE_NAME, encodeSessionCookie(sessionId))
                .body(body("가온", 8, "BACKEND"))
                .when()
                .post(SIGNUP_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }
}

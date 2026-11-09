package com.project.jarihana.member.command.controller;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.member.domain.MemberType;
import com.project.jarihana.support.CrewRosterFixture;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.SignupSessionFixture;
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

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 가입 완료는 Request Body가 아니라 가입 세션의 githubId로 회원을 만든다.
 *
 * <p>가입 화면은 닉네임만 받는다. 크루 여부는 요청 값이 아니라 크루 명단에 그 githubId가 있는지로 정한다.
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
    private SignupSessionFixture signupSessionFixture;

    @Autowired
    private CrewRosterFixture crewRosterFixture;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @DisplayName("크루 명단에 없는 GitHub 사용자는 닉네임만으로 기본 멤버로 가입한다.")
    @Test
    void completeBasicMemberSignup() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("도담"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getBoolean("success")).isTrue();
        Long id = response.jsonPath().getLong("data.id");
        assertThat(response.header(HttpHeaders.LOCATION)).isEqualTo("/api/members/" + id);
        assertThat(response.jsonPath().getString("data.crewName")).isEqualTo("도담");
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("MEMBER");
        assertThat((Object) response.jsonPath().get("data.generation")).isNull();
        assertThat((Object) response.jsonPath().get("data.course")).isNull();
        assertThat(response.jsonPath().getString("data.joinedAt")).isNotBlank();
        assertThat(memberRepository.findByGithubId(GITHUB_ID)).get()
                .extracting(Member::getMemberType)
                .isEqualTo(MemberType.MEMBER);
    }

    @DisplayName("크루 명단에 있는 GitHub 사용자는 입력한 닉네임과 명단의 기수, 과정으로 크루로 가입한다.")
    @Test
    void completeCrewSignupFromRoster() {
        // Given
        crewRosterFixture.register(GITHUB_ID, 8, "BACKEND");
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("요크"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getString("data.crewName")).isEqualTo("요크");
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("CREW");
        assertThat(response.jsonPath().getInt("data.generation")).isEqualTo(8);
        assertThat(response.jsonPath().getString("data.course")).isEqualTo("BACKEND");
    }

    @DisplayName("요청에 크루 유형과 기수를 적어도 명단에 없으면 기본 멤버로 가입한다.")
    @Test
    void ignoreSelfReportedCrewProfileWithoutRoster() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, Map.of(
                "crewName", "가온",
                "memberType", "CREW",
                "generation", 8,
                "course", "BACKEND"
        ));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("MEMBER");
        assertThat((Object) response.jsonPath().get("data.generation")).isNull();
    }

    @DisplayName("명단에 있으면 요청한 기수, 과정과 달라도 명단 값으로 크루가 된다.")
    @Test
    void preferRosterProfileOverRequestedProfile() {
        // Given
        crewRosterFixture.register(GITHUB_ID, 7, "ANDROID");
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, Map.of(
                "crewName", "가온",
                "memberType", "CREW",
                "generation", 8,
                "course", "BACKEND"
        ));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getInt("data.generation")).isEqualTo(7);
        assertThat(response.jsonPath().getString("data.course")).isEqualTo("ANDROID");
    }

    @DisplayName("이전 가입 화면이 부트캠프나 현직자 정보를 보내도 소속 정보 없이 기본 멤버로 가입한다.")
    @Test
    void ignoreAffiliationFromPreviousSignupScreen() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, Map.of(
                "crewName", "도담",
                "memberType", "BOOTCAMP",
                "bootcamp", Map.of("name", "SSAFY", "status", "IN_PROGRESS", "cohort", "12기"),
                "field", "BACKEND"
        ));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("MEMBER");
        assertThat((Object) response.jsonPath().get("data.bootcamp")).isNull();
        assertThat((Object) response.jsonPath().get("data.field")).isNull();
    }

    @DisplayName("코치는 기수 없이 가입할 수 있다.")
    @Test
    void completeCoachSignupWithoutGeneration() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

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
        String sessionId = signupSessionFixture.create(GITHUB_ID);

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
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(
                sessionId,
                Map.of("crewName", "코치", "memberType", "COACH")
        );

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    @DisplayName("명단 크루의 닉네임은 코치 이름과 중복될 수 없다.")
    @Test
    void rejectRosterCrewNameDuplicatedWithCoachName() {
        // Given
        memberRepository.save(Member.create("코치", null, "other-github-id", MemberType.COACH, null));
        crewRosterFixture.register(GITHUB_ID, 8, "BACKEND");
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("코치"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    @DisplayName("명단 크루의 닉네임은 같은 기수 크루와 중복될 수 없다.")
    @Test
    void rejectRosterCrewNameDuplicatedInSameGeneration() {
        // Given
        memberRepository.save(Member.create("가온", 8, "other-github-id", Course.FRONTEND));
        crewRosterFixture.register(GITHUB_ID, 8, "BACKEND");
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
        assertThat(memberRepository.findByGithubId(GITHUB_ID)).isEmpty();
    }

    @DisplayName("명단 크루는 다른 기수 크루와 같은 닉네임을 사용할 수 있다.")
    @Test
    void allowRosterCrewNameUsedInDifferentGeneration() {
        // Given
        memberRepository.save(Member.create("가온", 7, "other-github-id", Course.FRONTEND));
        crewRosterFixture.register(GITHUB_ID, 8, "BACKEND");
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("CREW");
    }

    @DisplayName("기본 멤버는 코치나 다른 기본 멤버와 같은 닉네임을 사용할 수 없다.")
    @Test
    void rejectBasicMemberNameDuplicatedWithNonCrew() {
        // Given
        memberRepository.save(Member.create("코치", null, "coach-github-id", MemberType.COACH, null));
        memberRepository.save(Member.createBasic("도담", "basic-github-id"));
        String coachNameSession = signupSessionFixture.create(GITHUB_ID);
        String basicNameSession = signupSessionFixture.create("another-github-id");

        // When
        ExtractableResponse<Response> coachName = signup(coachNameSession, body("코치"));
        ExtractableResponse<Response> basicName = signup(basicNameSession, body("도담"));

        // Then
        assertThat(coachName.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(coachName.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
        assertThat(basicName.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(basicName.jsonPath().getString("error.code")).isEqualTo("MEMBER_CREW_DUPLICATED");
    }

    @DisplayName("기본 멤버는 크루와 같은 닉네임을 사용할 수 있다.")
    @Test
    void allowBasicMemberNameSameAsCrewName() {
        // Given
        memberRepository.save(Member.create("도담", 8, "other-github-id", Course.BACKEND));
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("도담"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CREATED.value());
        assertThat(response.jsonPath().getString("data.memberType")).isEqualTo("MEMBER");
    }

    private Map<String, Object> body(String crewName) {
        return Map.of("crewName", crewName);
    }

    private ExtractableResponse<Response> signup(String sessionId, Map<String, Object> body) {
        String csrfToken = issueCsrfToken();
        RequestSpecification request = RestAssured.given()
                .contentType(ContentType.JSON)
                .cookie(CSRF_COOKIE_NAME, csrfToken)
                .header(CSRF_HEADER_NAME, csrfToken)
                .body(body);
        if (sessionId != null) {
            request = request.cookie(SESSION_COOKIE_NAME, signupSessionFixture.cookieValue(sessionId));
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

    @DisplayName("가입을 마치면 이후 API에서 쓸 토큰 쿠키를 받는다.")
    @Test
    void issueTokenCookiesAfterSignup() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온"));

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
        String sessionId = signupSessionFixture.create(GITHUB_ID);
        ExtractableResponse<Response> signup = signup(sessionId, body("가온"));

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
        ExtractableResponse<Response> response = signup(null, body("가온"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("SIGNUP_SESSION_REQUIRED");
    }

    @DisplayName("이미 가입한 GitHub 사용자는 거부한다.")
    @Test
    void rejectAlreadyRegisteredGithubUser() {
        // Given
        memberRepository.save(Member.create("우주", 8, GITHUB_ID, Course.BACKEND));
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("가온"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.CONFLICT.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("MEMBER_ALREADY_EXISTS");
    }

    @DisplayName("닉네임 형식이 올바르지 않으면 거부한다.")
    @Test
    void rejectInvalidCrewName() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, body("crew"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
    }

    @DisplayName("알 수 없는 회원 유형은 거부한다.")
    @Test
    void rejectUnknownMemberType() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = signup(sessionId, Map.of("crewName", "가온", "memberType", "ADMIN"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("INVALID_PARAMETER");
        assertThat(memberRepository.findByGithubId(GITHUB_ID)).isEmpty();
    }

    @DisplayName("CSRF 토큰이 없는 가입 요청은 거부한다.")
    @Test
    void rejectSignupWithoutCsrfToken() {
        // Given
        String sessionId = signupSessionFixture.create(GITHUB_ID);

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .contentType(ContentType.JSON)
                .cookie(SESSION_COOKIE_NAME, signupSessionFixture.cookieValue(sessionId))
                .body(body("가온"))
                .when()
                .post(SIGNUP_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }
}

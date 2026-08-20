package com.project.jarihana.auth.command.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.RefreshTokenHasher;
import com.project.jarihana.auth.command.service.RefreshTokenIssuer;
import com.project.jarihana.auth.domain.RefreshToken;
import com.project.jarihana.common.auth.AccessTokenProvider;
import com.project.jarihana.common.auth.AuthCookieProperties;
import com.project.jarihana.common.auth.JwtProperties;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.RestAssured;
import io.restassured.http.Cookie;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

/**
 * 재발급은 Refresh Token 쿠키만으로 새 Access Token을 내려준다.
 *
 * <p>Access Token은 HttpOnly 쿠키로 전달하므로 응답 본문에 값을 담지 않는다(ADR 0002).
 * 본문에는 프론트엔드가 다음 재발급 시점을 잡을 수 있도록 남은 유효 기간만 둔다.
 *
 * <p>회전은 아직 도입하지 않는다. 재발급해도 Refresh Token은 그대로 남는다.
 */
class AuthRefreshAcceptanceTest extends IntegrationTestSupport {

    private static final String REFRESH_PATH = "/api/auth/refresh";
    private static final String MY_PROFILE_PATH = "/api/members/me";
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
    private RefreshTokenHasher refreshTokenHasher;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private JwtProperties jwtProperties;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @DisplayName("Refresh Token으로 Access Token을 재발급한다.")
    @Test
    void reissueAccessToken() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = refresh(request -> request
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.jsonPath().getBoolean("success")).isTrue();
        assertThat(response.jsonPath().getLong("data.expiresIn")).isEqualTo(jwtProperties.validity().toSeconds());
        Cookie accessCookie = response.detailedCookie(authCookieProperties.accessTokenName());
        assertThat(accessCookie.isHttpOnly()).isTrue();
        assertThat(accessTokenProvider.parseMemberId(accessCookie.getValue())).isEqualTo(member.getId());
    }

    @DisplayName("응답 본문에 Access Token 값을 담지 않는다.")
    @Test
    void notExposeAccessTokenInBody() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = refresh(request -> request
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        assertThat((Object) response.jsonPath().get("data.accessToken")).isNull();
    }

    @DisplayName("재발급해도 Refresh Token은 그대로 남는다.")
    @Test
    void keepRefreshTokenWithoutRotation() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = refresh(request -> request
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        assertThat(response.cookie(authCookieProperties.refreshTokenName())).isNull();
        assertThat(refreshTokenRepository.findByTokenHash(refreshTokenHasher.hash(refreshToken))).isPresent();
    }

    @DisplayName("같은 Refresh Token으로 여러 번 재발급할 수 있다.")
    @Test
    void reissueRepeatedlyWithSameRefreshToken() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();
        refresh(request -> request.cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // When
        ExtractableResponse<Response> response = refresh(request -> request
                .cookie(authCookieProperties.refreshTokenName(), refreshToken));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
    }

    @DisplayName("Refresh Token이 없으면 거부한다.")
    @Test
    void rejectRefreshWithoutToken() {
        // Given

        // When
        ExtractableResponse<Response> response = refresh(request -> request);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_REQUIRED");
    }

    @DisplayName("저장소에 없는 Refresh Token은 거부한다.")
    @Test
    void rejectUnknownRefreshToken() {
        // Given

        // When
        ExtractableResponse<Response> response = refresh(request -> request
                .cookie(authCookieProperties.refreshTokenName(), "unknown-refresh-token"));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_INVALID");
    }

    @DisplayName("유효 기간이 지난 Refresh Token은 거부한다.")
    @Test
    void rejectExpiredRefreshToken() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String expiredToken = "expired-refresh-token";
        refreshTokenRepository.save(RefreshToken.issue(
                member,
                refreshTokenHasher.hash(expiredToken),
                TestSupportConfig.FIXED_NOW.minusSeconds(1)
        ));

        // When
        ExtractableResponse<Response> response = refresh(request -> request
                .cookie(authCookieProperties.refreshTokenName(), expiredToken));

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("REFRESH_TOKEN_INVALID");
        assertThat(refreshTokenRepository.findAll()).hasSize(1);
    }

    @DisplayName("CSRF 토큰이 없는 재발급 요청은 거부한다.")
    @Test
    void rejectRefreshWithoutCsrfToken() {
        // Given
        Member member = memberRepository.save(Member.create("가온", 8, GITHUB_ID, Course.BACKEND));
        String refreshToken = refreshTokenIssuer.issue(member).value();

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.refreshTokenName(), refreshToken)
                .when()
                .post(REFRESH_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }

    private ExtractableResponse<Response> refresh(CredentialSpec credentials) {
        String csrfToken = issueCsrfToken();
        RequestSpecification request = RestAssured.given()
                .cookie(CSRF_COOKIE_NAME, csrfToken)
                .header(CSRF_HEADER_NAME, csrfToken);
        return credentials.apply(request)
                .when()
                .post(REFRESH_PATH)
                .then()
                .extract();
    }

    @FunctionalInterface
    private interface CredentialSpec {

        RequestSpecification apply(RequestSpecification request);
    }

    private String issueCsrfToken() {
        return RestAssured.given()
                .when()
                .get(MY_PROFILE_PATH)
                .then()
                .extract()
                .cookie(CSRF_COOKIE_NAME);
    }
}

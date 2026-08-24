package com.project.jarihana.common.auth;

import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import io.restassured.RestAssured;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Access Token 쿠키 기반 인증 필터의 계약을 검증한다.
 *
 * <p>보호 경로로 {@code /members/me}를 사용하지만 이 엔드포인트는 아직 구현하지 않았다.
 * Spring Security는 요청을 Controller로 라우팅하기 전에 거부하므로 인증 실패 케이스는
 * 엔드포인트 구현과 무관하게 성립한다. 인증에 성공한 요청의 응답 본문은
 * {@code GET /members/me}를 구현하는 후속 작업에서 검증한다.
 */
class JwtCookieAuthenticationAcceptanceTest extends IntegrationTestSupport {

    private static final String PROTECTED_PATH = "/members/me";
    private static final String CALLBACK_PATH = "/oauth/github/callback";
    private static final String OTHER_SECRET = "another-access-token-secret-key-for-hmac-0002";
    private static final Long MEMBER_ID = 12L;

    @Autowired
    private JwtProperties jwtProperties;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @Autowired
    private Clock clock;

    @DisplayName("자격 증명이 없는 요청은 401 공통 오류 봉투로 거부한다.")
    @Test
    void rejectRequestWithoutCredentials() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .when()
                .get(PROTECTED_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getBoolean("success")).isFalse();
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @DisplayName("유효 기간이 지난 Access Token 쿠키는 거부한다.")
    @Test
    void rejectExpiredAccessTokenCookie() {
        // Given
        String expired = providerAt(jwtProperties, expiredClock()).issue(MEMBER_ID).value();

        // When
        ExtractableResponse<Response> response = getProtectedPathWithAccessToken(expired);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    private ExtractableResponse<Response> getProtectedPathWithAccessToken(String accessToken) {
        return RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .when()
                .get(PROTECTED_PATH)
                .then()
                .extract();
    }

    private AccessTokenProvider providerAt(JwtProperties properties, Clock issuedAt) {
        return new AccessTokenProvider(properties, issuedAt);
    }

    private Clock expiredClock() {
        return Clock.fixed(
                TestSupportConfig.FIXED_NOW
                        .minus(jwtProperties.validity())
                        .minusSeconds(1)
                        .atZone(TestSupportConfig.ZONE)
                        .toInstant(),
                TestSupportConfig.ZONE
        );
    }

    @DisplayName("다른 비밀키로 서명한 Access Token 쿠키는 거부한다.")
    @Test
    void rejectForgedAccessTokenCookie() {
        // Given
        String forged = providerAt(propertiesWithSecret(OTHER_SECRET), clock).issue(MEMBER_ID).value();

        // When
        ExtractableResponse<Response> response = getProtectedPathWithAccessToken(forged);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    private JwtProperties propertiesWithSecret(String secret) {
        return new JwtProperties(secret, jwtProperties.validity());
    }

    @DisplayName("JWT 형식이 아닌 Access Token 쿠키는 거부한다.")
    @Test
    void rejectMalformedAccessTokenCookie() {
        // Given
        String malformed = "not-a-json-web-token";

        // When
        ExtractableResponse<Response> response = getProtectedPathWithAccessToken(malformed);

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    @DisplayName("CSRF 토큰이 없는 상태 변경 요청은 403 공통 오류 봉투로 거부한다.")
    @Test
    void rejectStateChangingRequestWithoutCsrfToken() {
        // Given
        String accessToken = providerAt(jwtProperties, clock).issue(MEMBER_ID).value();

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .when()
                .post(PROTECTED_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
        assertThat(response.jsonPath().getBoolean("success")).isFalse();
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("ACCESS_DENIED");
    }

    @DisplayName("OAuth 콜백은 자격 증명 없이 접근할 수 있다.")
    @Test
    void allowOAuthCallbackWithoutCredentials() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .redirects().follow(false)
                .queryParam("code", "authorization-code")
                .queryParam("state", "issued-state-value")
                .when()
                .get(CALLBACK_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.BAD_REQUEST.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("OAUTH_STATE_INVALID");
    }
}

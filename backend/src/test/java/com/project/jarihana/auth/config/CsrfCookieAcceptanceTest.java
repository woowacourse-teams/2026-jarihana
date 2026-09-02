package com.project.jarihana.auth.config;

import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.http.Cookie;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * CSRF 쿠키가 프론트엔드에서 읽을 수 있는 형태로 나가는지 검증한다.
 *
 * <p>브라우저는 문서 경로에 맞는 쿠키만 {@code document.cookie}로 노출한다. 쿠키 path가
 * context-path인 {@code /api}로 좁혀지면 루트 경로에서 뜨는 SPA가 토큰을 읽지 못해
 * {@code X-XSRF-TOKEN} 헤더를 채울 수 없고, 변경 요청이 전부 403으로 막힌다.
 */
class CsrfCookieAcceptanceTest extends IntegrationTestSupport {

    private static final String PUBLIC_PATH = "/groups";
    private static final String PROTECTED_POST_PATH = "/recruitments/1/registrations";

    @DisplayName("CSRF 쿠키는 SPA가 읽을 수 있도록 루트 경로로 내린다.")
    @Test
    void issueCsrfCookieOnRootPath() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .when()
                .get(PUBLIC_PATH)
                .then()
                .extract();

        // Then
        Cookie csrfCookie = response.detailedCookie("XSRF-TOKEN");
        assertThat(csrfCookie).isNotNull();
        assertThat(csrfCookie.getPath()).isEqualTo("/");
        assertThat(csrfCookie.isHttpOnly()).isFalse();
    }

    @DisplayName("CSRF 토큰이 없는 변경 요청은 403으로 거부한다.")
    @Test
    void rejectMutationWithoutCsrfToken() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .contentType("application/json")
                .body("{\"message\":\"함께하고 싶어요.\"}")
                .when()
                .post(PROTECTED_POST_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @DisplayName("CSRF 토큰을 갖춘 변경 요청은 CSRF가 아니라 인증에서 걸린다.")
    @Test
    void passCsrfAndFailAuthentication() {
        // Given
        String csrfToken = RestAssured.given()
                .when()
                .get(PUBLIC_PATH)
                .then()
                .extract()
                .cookie("XSRF-TOKEN");

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .contentType("application/json")
                .cookie("XSRF-TOKEN", csrfToken)
                .header("X-XSRF-TOKEN", csrfToken)
                .body("{\"message\":\"함께하고 싶어요.\"}")
                .when()
                .post(PROTECTED_POST_PATH)
                .then()
                .extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }
}

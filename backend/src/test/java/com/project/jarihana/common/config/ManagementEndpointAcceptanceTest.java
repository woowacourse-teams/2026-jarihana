package com.project.jarihana.common.config;

import com.project.jarihana.auth.config.AuthCookieProperties;
import com.project.jarihana.auth.token.AccessTokenProvider;
import com.project.jarihana.support.IntegrationTestSupport;
import io.restassured.RestAssured;
import io.restassured.response.ExtractableResponse;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("prod")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "management.server.port=0",
        "management.server.address=127.0.0.1",
        "spring.application.name=jarihana",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.session.jdbc.initialize-schema=always"
})
class ManagementEndpointAcceptanceTest extends IntegrationTestSupport {

    @Value("${local.management.port}")
    private int managementPort;

    @Autowired
    private AccessTokenProvider accessTokenProvider;

    @Autowired
    private AuthCookieProperties authCookieProperties;

    @DisplayName("관리용 포트에서 인증 없이 상태를 읽고 내부 구성은 숨긴다.")
    @Test
    void readHealthWithoutAuthenticationAndHideDetails() {
        // Given
        RequestSpecification request = managementRequest();

        // When
        ExtractableResponse<Response> response = request.get("/actuator/health").then().extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.jsonPath().getString("status")).isEqualTo("UP");
        assertThat(response.jsonPath().getMap("$")).containsOnlyKeys("status");
    }

    @DisplayName("관리용 포트에서 JVM과 커넥션 풀 메트릭을 Prometheus 형식으로 읽는다.")
    @Test
    void readPrometheusMetricsWithoutAuthentication() {
        // Given
        RequestSpecification request = managementRequest();

        // When
        ExtractableResponse<Response> response = request.get("/actuator/prometheus").then().extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.OK.value());
        assertThat(response.contentType()).startsWith("text/plain");
        assertThat(response.asString()).contains(
                "jvm_memory_used_bytes",
                "jvm_threads_live_threads",
                "hikaricp_connections_active",
                "application=\"jarihana\"",
                "environment=\"prod\""
        );
    }

    @DisplayName("공개 API 포트에서는 인증한 사용자도 메트릭을 읽을 수 없다.")
    @Test
    void denyPrometheusOnApplicationPortEvenWithAuthentication() {
        // Given
        String accessToken = accessTokenProvider.issue(1L).value();

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .cookie(authCookieProperties.accessTokenName(), accessToken)
                .get("/actuator/prometheus")
                .then().extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @DisplayName("관리용 포트에서는 허용하지 않은 엔드포인트를 거부한다.")
    @Test
    void denyOtherManagementEndpoints() {
        // Given
        RequestSpecification request = managementRequest();

        // When
        ExtractableResponse<Response> response = request.get("/actuator/env").then().extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @DisplayName("관리용 엔드포인트의 변경 요청은 거부한다.")
    @Test
    void denyManagementMutation() {
        // Given
        RequestSpecification request = managementRequest();

        // When
        ExtractableResponse<Response> response = request.post("/actuator/prometheus").then().extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.FORBIDDEN.value());
    }

    @DisplayName("운영 프로필에서도 기존 보호 API는 인증 없는 요청을 거부한다.")
    @Test
    void preserveAuthenticationOnApplicationPort() {
        // Given

        // When
        ExtractableResponse<Response> response = RestAssured.given()
                .get("/members/me")
                .then().extract();

        // Then
        assertThat(response.statusCode()).isEqualTo(HttpStatus.UNAUTHORIZED.value());
        assertThat(response.jsonPath().getString("error.code")).isEqualTo("UNAUTHENTICATED");
    }

    private RequestSpecification managementRequest() {
        return RestAssured.given().port(managementPort).basePath("");
    }
}

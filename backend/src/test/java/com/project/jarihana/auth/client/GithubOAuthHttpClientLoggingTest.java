package com.project.jarihana.auth.client;

import ch.qos.logback.classic.spi.ILoggingEvent;
import com.project.jarihana.auth.config.GithubOAuthProperties;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.support.CapturedApplicationLogs;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static com.project.jarihana.support.CapturedApplicationLogs.fields;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GithubOAuthHttpClientLoggingTest {

    private HttpServer server;
    private CapturedApplicationLogs logs;
    private String tokenBody;
    private String userBody;
    private int tokenStatus;
    private GithubOAuthHttpClient client;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        tokenBody = "{\"access_token\":\"provider-access-token-secret\"}";
        userBody = "{\"id\":123456}";
        tokenStatus = 200;
        server.createContext("/token", exchange -> {
            byte[] body = tokenBody.getBytes(StandardCharsets.UTF_8);
            exchange.getRequestBody().readAllBytes();
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(tokenStatus, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/user", exchange -> {
            byte[] body = userBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        String origin = "http://127.0.0.1:" + server.getAddress().getPort();
        client = new GithubOAuthHttpClient(new GithubOAuthProperties(
                "client-id", "client-secret-sentinel", origin + "/callback",
                origin + "/token?credential=query-secret-sentinel", origin + "/user"
        ));
        logs = new CapturedApplicationLogs();
    }

    @AfterEach
    void tearDown() {
        logs.close();
        server.stop(0);
    }

    @DisplayName("GitHub 토큰과 사용자 HTTP 호출을 각각 기록하고 비밀값을 제외한다.")
    @Test
    void recordsBothGithubExchangesWithoutCredentials() {
        // Given / When
        String githubId = client.getGithubId("authorization-code-sentinel");

        // Then
        assertThat(githubId).isEqualTo("123456");
        List<ILoggingEvent> exchanges = exchanges();
        assertThat(exchanges).hasSize(2);
        assertThat(fields(exchanges.get(0)))
                .containsEntry("http.request.method", "POST")
                .containsEntry("url.path", "/token")
                .containsEntry("http.response.status_code", 200);
        assertThat(fields(exchanges.get(1)))
                .containsEntry("http.request.method", "GET")
                .containsEntry("url.path", "/user");
        assertThat(fields(exchanges.get(0)).get("event.duration")).isInstanceOf(Long.class);
        assertThat(logs.events().stream().map(event -> event.getFormattedMessage() + fields(event)).toList())
                .allSatisfy(text -> assertThat(text).doesNotContain(
                        "provider-access-token-secret", "client-secret-sentinel", "query-secret-sentinel",
                        "authorization-code-sentinel", "Bearer", "123456"
                ));
    }

    @DisplayName("GitHub 오류 응답의 상태를 기록하지만 응답 본문은 기록하지 않는다.")
    @Test
    void recordsFailedExchangeWithoutProviderResponseBody() {
        // Given
        tokenStatus = 503;
        tokenBody = "{\"error\":\"provider-response-secret-sentinel\"}";

        // When / Then
        assertThatThrownBy(() -> client.getGithubId("authorization-code-sentinel"))
                .isInstanceOf(BusinessException.class);
        assertThat(exchanges()).singleElement().satisfies(event -> {
            assertThat(fields(event)).containsEntry("http.response.status_code", 503)
                    .containsEntry("event.outcome", "failure");
            assertThat(fields(event).toString()).doesNotContain("provider-response-secret-sentinel");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    @DisplayName("GitHub HTTP 200이어도 토큰이 없으면 OAuth 처리는 실패한다.")
    @Test
    void preservesLogicalFailureAfterSuccessfulHttpExchange() {
        // Given
        tokenBody = "{}";

        // When / Then
        assertThatThrownBy(() -> client.getGithubId("authorization-code-sentinel"))
                .isInstanceOf(BusinessException.class);
        assertThat(exchanges()).singleElement().satisfies(event -> assertThat(fields(event))
                .containsEntry("http.response.status_code", 200));
    }

    @DisplayName("GitHub 응답 JSON 변환 실패를 성공한 OAuth 처리로 바꾸지 않는다.")
    @Test
    void preservesMalformedProviderResponseFailure() {
        // Given
        tokenBody = "malformed-provider-response-secret";

        // When / Then
        assertThatThrownBy(() -> client.getGithubId("authorization-code-sentinel"))
                .isInstanceOf(BusinessException.class);
        assertThat(exchanges()).hasSize(1);
        assertThat(logs.events().stream().map(event -> event.getFormattedMessage() + fields(event)).toList())
                .allSatisfy(text -> assertThat(text).doesNotContain("malformed-provider-response-secret"));
    }

    private List<ILoggingEvent> exchanges() {
        return logs.events().stream()
                .filter(event -> "github.http.completed".equals(fields(event).get("event.action")))
                .toList();
    }
}

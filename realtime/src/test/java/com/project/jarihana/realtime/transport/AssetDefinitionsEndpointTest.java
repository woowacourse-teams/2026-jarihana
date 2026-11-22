package com.project.jarihana.realtime.transport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"realtime.enabled=false", "realtime.allowed-origins=https://app.example"})
class AssetDefinitionsEndpointTest {
    @LocalServerPort
    int port;

    @Autowired
    ObjectMapper mapper;

    @Test
    void servesThePackagedDefinitionsWithoutCredentialsOrAConnection() throws Exception {
        try (var client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build()) {
            var request = HttpRequest.newBuilder(endpoint("http"))
                    .timeout(Duration.ofSeconds(5)).header("Origin", "https://public.example").GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Content-Type").orElseThrow()).startsWith("application/json");
            assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains("*");
            assertThat(response.headers().firstValue("Access-Control-Allow-Credentials")).isEmpty();
            JsonNode envelope = mapper.readTree(response.body());
            assertThat(envelope.path("success").asBoolean()).isTrue();
            assertThat(envelope.path("error").isNull()).isTrue();
            JsonNode data = envelope.path("data");
            assertThat(data.path("capabilities")).isEqualTo(resource("asset-capabilities.json"));
            assertThat(data.has("surfaceAnchors")).isFalse();
            JsonNode shelf = data.path("capabilities").path("assets").path("pantryShelf");
            assertThat(shelf.path("surface").path("slots").asInt()).isEqualTo(4);
            assertThat(shelf.path("storage").path("capacity").asInt()).isEqualTo(8);
            JsonNode sofa = data.path("capabilities").path("assets").path("sofa");
            assertThat(sofa.path("seatCount").asInt()).isEqualTo(3);
            assertThat(sofa.has("seats")).isFalse();
            assertThat(sofa.has("seatFit")).isFalse();
        }
    }

    @Test
    void upgradesAtTheSamePathAndKeepsTheWebSocketOriginPolicy() throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var closed = new CompletableFuture<Integer>();
            client.newWebSocketBuilder().header("Origin", "https://app.example")
                    .buildAsync(endpoint("ws"), new WebSocket.Listener() {
                        @Override
                        public CompletableFuture<Void> onClose(WebSocket socket, int status, String reason) {
                            closed.complete(status);
                            return CompletableFuture.completedFuture(null);
                        }
                    }).get(5, TimeUnit.SECONDS);
            assertThat(closed.get(5, TimeUnit.SECONDS)).isEqualTo(4001);

            assertThatThrownBy(() -> client.newWebSocketBuilder().header("Origin", "https://public.example")
                    .buildAsync(endpoint("ws"), new WebSocket.Listener() {}).get(5, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(WebSocketHandshakeException.class)
                    .satisfies(error -> assertThat(((WebSocketHandshakeException) error.getCause())
                            .getResponse().statusCode()).isEqualTo(403));
        }
    }

    private URI endpoint(String scheme) {
        return URI.create(scheme + "://127.0.0.1:" + port + "/ws/realtime");
    }

    private JsonNode resource(String file) throws IOException {
        try (var input = new ClassPathResource("contracts/" + file).getInputStream()) {
            return mapper.readTree(input);
        }
    }
}

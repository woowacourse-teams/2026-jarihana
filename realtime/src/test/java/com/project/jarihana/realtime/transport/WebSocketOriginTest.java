package com.project.jarihana.realtime.transport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"realtime.enabled=false", "realtime.allowed-origins=https://app.example"})
class WebSocketOriginTest {
    @LocalServerPort
    int port;

    @Test
    void acceptsOnlyTheConfiguredWebSocketOrigin() throws Exception {
        URI endpoint = URI.create("ws://127.0.0.1:" + port + "/ws/realtime");
        try (var client = HttpClient.newHttpClient()) {
            var closed = new CompletableFuture<Integer>();
            client.newWebSocketBuilder().header("Origin", "https://app.example")
                    .buildAsync(endpoint, new WebSocket.Listener() {
                        @Override
                        public CompletableFuture<Void> onClose(WebSocket socket, int status, String reason) {
                            closed.complete(status);
                            return CompletableFuture.completedFuture(null);
                        }
                    }).get(5, TimeUnit.SECONDS);
            assertThat(closed.get(5, TimeUnit.SECONDS)).isEqualTo(4001);

            assertThatThrownBy(() -> client.newWebSocketBuilder().header("Origin", "https://public.example")
                    .buildAsync(endpoint, new WebSocket.Listener() {}).get(5, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(WebSocketHandshakeException.class)
                    .satisfies(error -> assertThat(((WebSocketHandshakeException) error.getCause())
                            .getResponse().statusCode()).isEqualTo(403));
        }
    }
}

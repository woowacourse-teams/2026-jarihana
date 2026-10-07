package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.pushsubscription.config.PushProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PinnedPushHttpSenderTest {
    private final PushProperties properties = new PushProperties(false, false, null, null, null, null, null, null,
            Duration.ofMillis(200), Duration.ofMillis(100), null);

    @Test
    void connectOnlyToPinnedAddressRetainHostAndRefuseRedirect() throws Exception {
        // Given
        var count = new AtomicInteger();
        var host = new AtomicReference<String>();
        var bytes = new AtomicReference<byte[]>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/push", exchange -> {
            count.incrementAndGet();
            host.set(exchange.getRequestHeaders().getFirst("Host"));
            bytes.set(exchange.getRequestBody().readAllBytes());
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1:" + server.getAddress().getPort() + "/push");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.start();
        try {
            try (var sender = new PinnedPushHttpSender(properties)) {
            HttpRequest prepared = HttpRequest.newBuilder(URI.create("http://push-test.invalid:" + server.getAddress().getPort() + "/push"))
                    .POST(HttpRequest.BodyPublishers.ofString("encrypted-fixture")).build();
            // When
            var response = sender.send(prepared, new InetAddress[]{InetAddress.getByName("127.0.0.1")});
            // Then
            assertThat(response.status()).isEqualTo(302);
            assertThat(count).hasValue(1);
            assertThat(host.get()).isEqualTo("push-test.invalid:" + server.getAddress().getPort());
            assertThat(new String(bytes.get(), StandardCharsets.UTF_8)).isEqualTo("encrypted-fixture");
            assertThatThrownBy(() -> PinnedPushHttpSender.pinnedResolver("push-test.invalid", InetAddress.getLoopbackAddress()).resolve("other.invalid"))
                    .isInstanceOf(UnknownHostException.class);
            }
        } finally { server.stop(0); }
    }

    @Test
    void slowDrippingHeadersCannotExtendAbsoluteDeadline() throws Exception {
        // Given
        try (var server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")); var executor = Executors.newSingleThreadExecutor()) {
            var handling = executor.submit(() -> {
                try (var socket = server.accept()) {
                    var reader = socket.getInputStream();
                    int matched = 0;
                    byte[] end = "\r\n\r\n".getBytes(StandardCharsets.US_ASCII);
                    while (matched < end.length) {
                        int value = reader.read();
                        if (value == -1) return;
                        matched = value == end[matched] ? matched + 1 : 0;
                    }
                    reader.readNBytes(1);
                    for (byte value : "HTTP/1.1 201 Created\r\nX-Slow: aaaaaaaaaaaaaaaaaaaaaaaaaa\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII)) {
                        socket.getOutputStream().write(value);
                        socket.getOutputStream().flush();
                        Thread.sleep(25);
                    }
                } catch (IOException exception) { }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            });
            var prepared = HttpRequest.newBuilder(URI.create("http://push-test.invalid:" + server.getLocalPort() + "/push"))
                    .POST(HttpRequest.BodyPublishers.ofString("x")).build();
            try (var sender = new PinnedPushHttpSender(properties)) {
            long started = System.nanoTime();
            // When / Then
            assertThatThrownBy(() -> sender.send(prepared, new InetAddress[]{InetAddress.getByName("127.0.0.1")}))
                    .isInstanceOf(IOException.class);
            assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
            handling.get(5, TimeUnit.SECONDS);
            }
        }
    }
}

package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.pushsubscription.config.PushProperties;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.DisplayName;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.slf4j.LoggerFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PinnedPushHttpSenderTest {
    private final PushProperties properties = new PushProperties(false, false, null, null, null, null, null, null,
            Duration.ofMillis(200), Duration.ofMillis(100), null);

    @Test
    @DisplayName("클라이언트 종료는 리액터의 정리가 끝난 뒤 자원을 닫는다")
    void shutdownDoesNotRaceWithReactorCleanup() throws Exception {
        // Given
        var logger = (Logger) LoggerFactory.getLogger("org.apache.hc.client5.http.impl.async");
        var logs = new ListAppender<ILoggingEvent>();
        logs.start();
        logger.addAppender(logs);
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/push", exchange -> {
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(201, -1);
            exchange.close();
        });
        server.start();
        try {
            var prepared = HttpRequest.newBuilder(URI.create("http://push-test.invalid:" + server.getAddress().getPort() + "/push"))
                    .POST(HttpRequest.BodyPublishers.ofString("x")).build();
            // When
            for (int index = 0; index < 10; index++) {
                try (var sender = new PinnedPushHttpSender(properties)) {
                    sender.send(prepared, new InetAddress[]{InetAddress.getLoopbackAddress()}).get(2, TimeUnit.SECONDS);
                }
            }
            // Then
            assertThat(logs.list).noneMatch(event -> event.getLevel().isGreaterOrEqual(Level.ERROR));
        } finally {
            logger.detachAppender(logs);
            logs.stop();
            server.stop(0);
        }
    }

    @Test
    @DisplayName("같은 호스트와 검증된 IP의 연결을 재사용한다")
    void reuseConnectionAcrossRequestsToSamePinnedHost() throws Exception {
        // Given
        var ports = new CopyOnWriteArrayList<Integer>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/push", exchange -> {
            exchange.getRequestBody().readAllBytes();
            ports.add(exchange.getRemoteAddress().getPort());
            exchange.sendResponseHeaders(201, -1);
            exchange.close();
        });
        server.start();
        try (var sender = new PinnedPushHttpSender(properties)) {
            var prepared = HttpRequest.newBuilder(URI.create("http://push-test.invalid:" + server.getAddress().getPort() + "/push"))
                    .POST(HttpRequest.BodyPublishers.ofString("x")).build();
            // When
            sender.send(prepared, new InetAddress[]{InetAddress.getLoopbackAddress()}).get(2, TimeUnit.SECONDS);
            sender.send(prepared, new InetAddress[]{InetAddress.getLoopbackAddress()}).get(2, TimeUnit.SECONDS);
            // Then
            assertThat(ports).hasSize(2);
            assertThat(ports.get(0)).isEqualTo(ports.get(1));
        } finally {
            server.stop(0);
        }
    }

    @Test
    @DisplayName("동시 요청은 각 요청에 고정된 IP와 원래 호스트를 유지한다")
    void concurrentRequestsKeepSeparatePinnedAddresses() throws Exception {
        // Given
        var arrived = new CountDownLatch(2);
        var hosts = new CopyOnWriteArrayList<String>();
        var ipv4 = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var ipv6 = HttpServer.create(new InetSocketAddress("::1", ipv4.getAddress().getPort()), 0);
        var relaxed = new PushProperties(false, false, null, null, null, null, null, null,
                Duration.ofSeconds(3), Duration.ofSeconds(1), null);
        for (var server : new HttpServer[]{ipv4, ipv6}) {
            server.createContext("/push", exchange -> {
                exchange.getRequestBody().readAllBytes();
                hosts.add(exchange.getRequestHeaders().getFirst("Host"));
                arrived.countDown();
                try {
                    if (!arrived.await(2, TimeUnit.SECONDS)) {
                        exchange.sendResponseHeaders(503, -1);
                    } else {
                        exchange.sendResponseHeaders(server == ipv4 ? 201 : 202, -1);
                    }
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                } finally {
                    exchange.close();
                }
            });
            server.start();
        }
        try (var sender = new PinnedPushHttpSender(relaxed)) {
            var prepared = HttpRequest.newBuilder(URI.create("http://push-test.invalid:" + ipv4.getAddress().getPort() + "/push"))
                    .POST(HttpRequest.BodyPublishers.ofString("x")).build();
            // When
            var first = sender.send(prepared, new InetAddress[]{InetAddress.getByName("127.0.0.1")});
            var second = sender.send(prepared, new InetAddress[]{InetAddress.getByName("::1")});
            CompletableFuture.allOf(first, second).get(4, TimeUnit.SECONDS);
            // Then
            assertThat(first.get().status()).isEqualTo(201);
            assertThat(second.get().status()).isEqualTo(202);
            assertThat(hosts).containsExactly(
                    "push-test.invalid:" + ipv4.getAddress().getPort(),
                    "push-test.invalid:" + ipv4.getAddress().getPort());
        } finally {
            ipv4.stop(0);
            ipv6.stop(0);
        }
    }

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
            var response = sender.send(prepared, new InetAddress[]{InetAddress.getByName("127.0.0.1")}).get(2, TimeUnit.SECONDS);
            // Then
            assertThat(response.status()).isEqualTo(302);
            assertThat(count).hasValue(1);
            assertThat(host.get()).isEqualTo("push-test.invalid:" + server.getAddress().getPort());
            assertThat(new String(bytes.get(), StandardCharsets.UTF_8)).isEqualTo("encrypted-fixture");
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
            assertThatThrownBy(() -> sender.send(prepared, new InetAddress[]{InetAddress.getByName("127.0.0.1")}).get(2, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class).hasCauseInstanceOf(IOException.class);
            assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
            handling.get(5, TimeUnit.SECONDS);
            }
        }
    }
}

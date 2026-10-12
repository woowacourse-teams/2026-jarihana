package com.project.jarihana.notificationdelivery.client;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult.Outcome;
import com.project.jarihana.pushsubscription.config.PushProperties;
import com.project.jarihana.pushsubscription.domain.PushEndpointPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import java.net.InetAddress;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.mockito.ArgumentCaptor;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.concurrent.atomic.AtomicReference;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.AfterEach;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import java.net.UnknownHostException;
import java.io.IOException;

class WebPushTransportTest {
    private static final String KEY = "BGsX0fLhLEJH-Lzm5WOkQPJ3A32BLeszoPShOUXYmMKWT-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU";
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-08-19T01:00:00Z"), ZoneOffset.ofHours(9));
    private final PushProperties properties = new PushProperties(true, false, KEY,
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE", "mailto:push@example.test", null, null, null, null, null, null);
    private final HttpClient client = mock(HttpClient.class);
    private final List<WebPushTransport> transports = new ArrayList<>();

    @AfterEach
    void closeTransports() { transports.forEach(WebPushTransport::close); }

    @Test
    void repeatedUninterruptibleDnsLookupsCannotCreateUnboundedTasks() {
        // Given
        var blocked = new CountDownLatch(1);
        var lookups = new AtomicInteger();
        var bounded = new PushProperties(true, false, KEY, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE",
                "mailto:push@example.test", null, null, null, null, Duration.ofMillis(100), null);
        var transport = new WebPushTransport(bounded, new PushEndpointPolicy(bounded), CLOCK, client, host -> {
            lookups.incrementAndGet();
            while (blocked.getCount() > 0) {
                try { blocked.await(); }
                catch (InterruptedException exception) { }
            }
            return new InetAddress[]{InetAddress.getLoopbackAddress()};
        });
        try {
            // When
            for (int i = 0; i < 3; i++) assertThat(transport.send(request()).outcome()).isEqualTo(Outcome.RETRY);
            // Then
            assertThat(lookups).hasValue(2);
            verifyNoInteractions(client);
        } finally { blocked.countDown(); transport.close(); }
    }

    @Test
    void dnsResolutionTimeoutDoesNotOccupyWorkerIndefinitely() {
        // Given
        var bounded = new PushProperties(true, false, KEY, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE",
                "mailto:push@example.test", null, null, null, null, Duration.ofMillis(100), null);
        try (var transport = new WebPushTransport(bounded, new PushEndpointPolicy(bounded), CLOCK, client, host -> {
            try { new CountDownLatch(1).await(); }
            catch (InterruptedException exception) { Thread.currentThread().interrupt(); }
            throw new UnknownHostException();
        })) {
            long started = System.nanoTime();
            // When
            var result = transport.send(request());
            // Then
            assertThat(result.outcome()).isEqualTo(Outcome.RETRY);
            assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
            verifyNoInteractions(client);
        }
    }

    @ParameterizedTest
    @CsvSource({"201,ACCEPTED", "202,ACCEPTED", "404,GONE", "410,GONE", "429,RETRY", "500,RETRY", "503,RETRY", "400,FAILED", "401,FAILED", "403,FAILED", "413,FAILED", "302,FAILED"})
    void classifyProviderStatus(int status, Outcome expected) throws Exception {
        // Given
        HttpResponse<Void> response = response(status, Map.of("Retry-After", List.of("60")));
        when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        // When
        var result = transport("8.8.8.8").send(request());
        // Then
        assertThat(result.outcome()).isEqualTo(expected);
        if (expected == Outcome.RETRY) assertThat(result.retryAfter()).isEqualTo(Duration.ofSeconds(60));
    }

    @Test
    void encryptedRequestCrossesRealHttpAndDecryptsToReferencesOnly() throws Exception {
        // Given
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var captured = new AtomicReference<byte[]>();
        var authorization = new AtomicReference<String>();
        server.createContext("/push", exchange -> {
            captured.set(exchange.getRequestBody().readAllBytes());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.sendResponseHeaders(201, -1);
            exchange.close();
        });
        server.start();
        try (var actualClient = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build()) {
            when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
                HttpRequest prepared = invocation.getArgument(0);
                var redirectedToFixture = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/push"))
                        .POST(prepared.bodyPublisher().orElseThrow()).timeout(prepared.timeout().orElseThrow());
                prepared.headers().map().forEach((name, values) -> values.forEach(value -> redirectedToFixture.header(name, value)));
                return actualClient.send(redirectedToFixture.build(), HttpResponse.BodyHandlers.discarding());
            });
            // When
            var result = transport("8.8.8.8").send(request());
            // Then
            assertThat(result.outcome()).isEqualTo(Outcome.ACCEPTED);
            var json = JsonMapper.builder().build();
            assertThat(json.readTree(WebPushCryptoAssertions.decrypt(captured.get(), KEY))).isEqualTo(json.readTree(
                    "{\"notificationId\":2,\"subscriptionId\":3,\"generation\":4,\"payloadVersion\":1}"));
            var jwt = json.readTree(WebPushCryptoAssertions.verifyVapid(authorization.get(), KEY));
            assertThat(jwt.get("aud").asString()).isEqualTo("https://fcm.googleapis.com");
            assertThat(jwt.get("sub").asString()).isEqualTo("mailto:push@example.test");
            assertThat(jwt.get("exp").asLong()).isEqualTo(CLOCK.instant().plusSeconds(900).getEpochSecond());
        } finally { server.stop(0); }
    }

    @ParameterizedTest
    @ValueSource(strings = {"Wed, 19 Aug 2026 01:01:00 GMT", "broken", "691200", "9223372036854775807"})
    void retryAfterSupportsDatesInvalidValuesAndLargeSeconds(String header) throws Exception {
        // Given
        var response = response(429, Map.of("Retry-After", List.of(header)));
        when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        // When
        var result = transport("8.8.8.8").send(request());
        // Then
        if (header.equals("broken")) assertThat(result.retryAfter()).isNull();
        else assertThat(result.retryAfter()).isEqualTo(Duration.ofSeconds(header.startsWith("Wed") ? 60 : Long.parseLong(header)));
    }

    @Test
    void invalidVapidKeyPairFailsBeforeAnyNetworkCall() {
        // Given
        var wrong = new PushProperties(true, false, KEY, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI",
                "mailto:push@example.test", null, null, null, null, null, null);
        // When / Then
        assertThatThrownBy(() -> new WebPushTransport(wrong, new PushEndpointPolicy(wrong), CLOCK, client, host -> new InetAddress[0]))
                .isInstanceOf(IllegalArgumentException.class).hasMessage("VAPID 키 쌍 또는 연락처 설정이 유효하지 않습니다.");
        verifyNoInteractions(client);
    }

    @Test
    void buildEncryptedRequestWithRemainingTtlAndVapid() throws Exception {
        // Given
        var response = response(201, Map.of());
        when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);
        // When
        transport("8.8.8.8").send(request());
        // Then
        var capture = ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(capture.capture(), any(HttpResponse.BodyHandler.class));
        var sent = capture.getValue();
        assertThat(sent.headers().firstValue("Content-Encoding")).contains("aes128gcm");
        assertThat(sent.headers().firstValue("TTL")).contains("3600");
        assertThat(sent.headers().firstValue("Authorization").orElseThrow()).startsWith("vapid t=").contains(", k=" + KEY);
        assertThat(sent.bodyPublisher().orElseThrow().contentLength()).isGreaterThan(100);
        assertThat(sent.timeout()).contains(Duration.ofSeconds(10));
    }

    @ParameterizedTest
    @ValueSource(strings = {"127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.0.1", "100.64.0.1", "::1", "fc00::1", "fe80::1", "224.0.0.1"})
    void refuseNonPublicDnsWithoutSending(String address) throws Exception {
        // Given / When
        var result = transport(address).send(request());
        // Then
        assertThat(result.outcome()).isEqualTo(Outcome.FAILED);
        verifyNoInteractions(client);
    }

    @Test
    void retryNetworkFailureWithoutRetainingExceptionMessage() throws Exception {
        // Given
        when(client.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(new IOException("secret endpoint"));
        // When
        var result = transport("8.8.8.8").send(request());
        // Then
        assertThat(result.outcome()).isEqualTo(Outcome.RETRY);
        assertThat(result.errorCode()).isEqualTo("NETWORK_ERROR");
    }

    private WebPushTransport transport(String address) throws Exception {
        var addresses = new InetAddress[]{InetAddress.getByName(address)};
        var transport = new WebPushTransport(properties, new PushEndpointPolicy(properties), CLOCK, client, host -> addresses);
        transports.add(transport);
        return transport;
    }

    private PushRequest request() {
        return new PushRequest(1, 2, 3, 4, 1, "https://fcm.googleapis.com/push/test", KEY,
                "AAAAAAAAAAAAAAAAAAAAAA", LocalDateTime.now(CLOCK).plusHours(1));
    }

    @SuppressWarnings("unchecked")
    private HttpResponse<Void> response(int status, Map<String, List<String>> headers) {
        HttpResponse<Void> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.headers()).thenReturn(HttpHeaders.of(headers, (a, b) -> true));
        return response;
    }
}

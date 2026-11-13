package com.project.jarihana.realtime.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.project.jarihana.realtime.TestSettings;
import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.auth.AdmissionTokenVerifier;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.layout.LayoutCatalog;
import com.project.jarihana.realtime.room.persistence.RoomReadRepository;
import com.project.jarihana.realtime.room.runtime.RoomRegistry;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

class RoomRegistryTest {
    private final TestSettings.MutableClock clock = new TestSettings.MutableClock();
    private final JsonMapper mapper = JsonMapper.builder().build();
    private final RoomReadRepository roomReads = mock(RoomReadRepository.class);
    private final SimpleMeterRegistry metrics = new SimpleMeterRegistry();
    private RoomRegistry registry;

    @BeforeEach
    void start() throws Exception {
        var properties = TestSettings.properties(TestSettings.DEV_TOKEN_KEY, TestSettings.PROD_TOKEN_KEY);
        when(roomReads.admission(eq(RealtimeEnvironment.DEV), anyString(), anyString())).thenReturn(admission());
        when(roomReads.layout(eq(RealtimeEnvironment.DEV), anyString())).thenReturn(new RoomReadRepository.StoredLayout(1, null));
        registry = new RoomRegistry(properties, new AdmissionTokenVerifier(properties, clock), roomReads,
                new LayoutCatalog(mapper), mapper, clock, metrics);
    }

    @AfterEach
    void stop() { registry.shutdown(); metrics.close(); }

    @Test
    void repeatedJtiCannotReplaceTheAuthenticatedConnection() throws Exception {
        Capture first = socket("a"), replay = socket("b");
        String token = token();
        authenticate(first, token);
        assertThat(first.snapshot.await(5, TimeUnit.SECONDS)).isTrue();
        authenticate(replay, token);
        assertThat(replay.closed.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(replay.status.get().getReason()).isEqualTo("TOKEN_REPLAYED");
        assertThat(first.status.get()).isNull();
        assertThat(metrics.get("realtime.websocket.admissions")
                .tags("environment", "dev", "outcome", "accepted").counter().count()).isEqualTo(1);
        assertThat(metrics.get("realtime.websocket.admissions")
                .tags("environment", "dev", "outcome", "rejected").counter().count()).isEqualTo(1);
        assertThat(metrics.get("realtime.websocket.rejections")
                .tag("reason", "authentication").counter().count()).isEqualTo(1);
    }

    @Test
    void activePlayersAndRoomsAreSeparatedByVerifiedEnvironment() throws Exception {
        when(roomReads.admission(eq(RealtimeEnvironment.PROD), anyString(), anyString())).thenReturn(admission());
        when(roomReads.layout(eq(RealtimeEnvironment.PROD), anyString())).thenReturn(new RoomReadRepository.StoredLayout(1, null));
        Capture dev = socket("dev"), prod = socket("prod"), invalid = socket("invalid");
        authenticate(dev, token());
        authenticate(prod, token(RealtimeEnvironment.PROD, TestSettings.PROD_TOKEN_KEY));
        authenticate(invalid, token(RealtimeEnvironment.PROD, TestSettings.DEV_TOKEN_KEY));
        assertThat(dev.snapshot.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(prod.snapshot.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(invalid.closed.await(5, TimeUnit.SECONDS)).isTrue();
        registry.disconnected("invalid");

        for (String environment : new String[] {"dev", "prod"}) {
            assertThat(metrics.get("realtime.active.players").tag("environment", environment).gauge().value()).isEqualTo(1);
            assertThat(metrics.get("realtime.active.rooms").tag("environment", environment).gauge().value()).isEqualTo(1);
        }
        assertThat(metrics.get("realtime.websocket.admissions")
                .tags("environment", "unknown", "outcome", "rejected").counter().count()).isEqualTo(1);

        registry.disconnected("dev", new CloseStatus(1000, "LEAVE"));
        assertThat(metrics.get("realtime.active.players").tag("environment", "dev").gauge().value()).isZero();
        assertThat(metrics.get("realtime.active.rooms").tag("environment", "dev").gauge().value()).isZero();
        assertThat(metrics.get("realtime.active.players").tag("environment", "prod").gauge().value()).isEqualTo(1);
    }

    @Test
    void databaseOutageDoesNotExtendPermissionLease() throws Exception {
        CountDownLatch renewal = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(roomReads.admission(eq(RealtimeEnvironment.DEV), anyString(), anyString())).thenAnswer(invocation -> {
            if (calls.incrementAndGet() == 1) return admission();
            renewal.countDown(); throw new DataAccessResourceFailureException("fixture outage");
        });
        Capture connection = socket("a"); authenticate(connection, token());
        assertThat(connection.snapshot.await(5, TimeUnit.SECONDS)).isTrue();
        clock.set(1500);
        assertThat(renewal.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(connection.status.get()).isNull();
        clock.set(3001);
        assertThat(connection.closed.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(connection.status.get().getReason()).isEqualTo("ACCESS_EXPIRED");
    }

    @Test
    void unauthenticatedConnectionTimesOut() throws Exception {
        Capture connection = socket("a"); registry.open(connection.socket);
        clock.set(6001);
        assertThat(connection.closed.await(5, TimeUnit.SECONDS)).isTrue();
        assertThat(connection.status.get().getCode()).isEqualTo(4005);
    }

    @Test
    void explicitLeaveCloseStatusClearsRoomBeforeReconnectGrace() throws Exception {
        Capture connection = socket("a"); authenticate(connection, token());
        assertThat(connection.snapshot.await(5, TimeUnit.SECONDS)).isTrue();
        registry.disconnected("a", new CloseStatus(1000, "LEAVE"));
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (metrics.get("realtime.rooms").gauge().value() > 0 && System.nanoTime() < deadline) Thread.sleep(10);
        assertThat(metrics.get("realtime.rooms").gauge().value()).isZero();
        assertThat(clock.millis()).isEqualTo(1000);
    }

    @Test
    void closedSocketCannotBeResurrectedByLateAdmission() throws Exception {
        CountDownLatch requested = new CountDownLatch(1), release = new CountDownLatch(1), returned = new CountDownLatch(1);
        when(roomReads.admission(eq(RealtimeEnvironment.DEV), anyString(), anyString())).thenAnswer(invocation -> {
            requested.countDown(); assertThat(release.await(5, TimeUnit.SECONDS)).isTrue(); returned.countDown(); return admission();
        });
        Capture connection = socket("a"); authenticate(connection, token());
        assertThat(requested.await(5, TimeUnit.SECONDS)).isTrue();
        registry.disconnected("a"); release.countDown();
        assertThat(returned.await(5, TimeUnit.SECONDS)).isTrue();
        registry.shutdown();
        assertThat(metrics.get("realtime.rooms").gauge().value()).isZero();
        assertThat(connection.snapshot.getCount()).isEqualTo(1);
    }

    private Admission admission() { return new Admission("7", "1", "tester", "#536bd6", null, "MEMBER", 3000, 1, null); }

    private void authenticate(Capture capture, String token) {
        registry.open(capture.socket);
        registry.message(capture.socket.getId(), Map.of("type", "AUTH_JOIN", "protocolVersion", 1, "token", token));
    }

    private String token() {
        return token(RealtimeEnvironment.DEV, TestSettings.DEV_TOKEN_KEY);
    }

    private String token(RealtimeEnvironment environment, String secret) {
        var key = Keys.hmacShaKeyFor(Base64.getUrlDecoder().decode(secret));
        return Jwts.builder().issuer(environment.issuer()).audience().add("jarihana-realtime").and().subject("1").claim("roomId", "7")
                .id(UUID.randomUUID().toString()).issuedAt(new Date(1000)).expiration(new Date(61000)).signWith(key, Jwts.SIG.HS256).compact();
    }

    private Capture socket(String id) throws Exception {
        Capture capture = new Capture(mock(WebSocketSession.class));
        when(capture.socket.getId()).thenReturn(id); when(capture.socket.isOpen()).thenReturn(true);
        doAnswer(invocation -> {
            var value = mapper.readTree(((TextMessage) invocation.getArgument(0)).getPayload());
            if (value.path("type").asString().equals("ROOM_SNAPSHOT")) capture.snapshot.countDown();
            return null;
        }).when(capture.socket).sendMessage(any());
        doAnswer(invocation -> { capture.status.set(invocation.getArgument(0)); capture.closed.countDown(); return null; }).when(capture.socket).close(any());
        return capture;
    }

    private static final class Capture {
        private final WebSocketSession socket;
        private final CountDownLatch snapshot = new CountDownLatch(1), closed = new CountDownLatch(1);
        private final AtomicReference<CloseStatus> status = new AtomicReference<>();
        private Capture(WebSocketSession socket) { this.socket = socket; }
    }
}

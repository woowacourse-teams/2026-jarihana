package com.project.jarihana.realtime.transport.websocket;

import com.project.jarihana.realtime.auth.AdmissionTokenVerifier.Identity;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;

public final class RealtimeSocketMetrics {
    private final Map<RealtimeEnvironment, Counter> accepted = new EnumMap<>(RealtimeEnvironment.class);
    private final Map<RealtimeEnvironment, Counter> rejected = new EnumMap<>(RealtimeEnvironment.class);
    private final Map<Rejection, Counter> rejections = new EnumMap<>(Rejection.class);
    private final Counter rejectedBeforeVerification;

    public RealtimeSocketMetrics(MeterRegistry registry) {
        for (RealtimeEnvironment environment : RealtimeEnvironment.values()) {
            String label = environment.name().toLowerCase(Locale.ROOT);
            accepted.put(environment, registry.counter("realtime.websocket.admissions", "environment", label, "outcome", "accepted"));
            rejected.put(environment, registry.counter("realtime.websocket.admissions", "environment", label, "outcome", "rejected"));
        }
        rejectedBeforeVerification = registry.counter("realtime.websocket.admissions", "environment", "unknown", "outcome", "rejected");
        for (Rejection reason : Rejection.values()) {
            rejections.put(reason, registry.counter("realtime.websocket.rejections", "reason", reason.name().toLowerCase(Locale.ROOT)));
        }
    }

    void accepted(Identity identity) {
        accepted.get(identity.environment()).increment();
    }

    void rejected(Identity identity) {
        Counter counter = identity == null ? rejectedBeforeVerification : rejected.get(identity.environment());
        counter.increment();
    }

    void closed(String reason) {
        Rejection rejection = switch (reason) {
            case "INVALID_TOKEN", "TOKEN_REPLAYED", "AUTH_REQUIRED", "ALREADY_AUTHENTICATED", "INVALID_ADMISSION" -> Rejection.AUTHENTICATION;
            case "AUTH_TIMEOUT", "HEARTBEAT_TIMEOUT" -> Rejection.TIMEOUT;
            case "OVERLOADED", "RATE_LIMITED" -> Rejection.OVERLOAD;
            case "SLOW_CONSUMER" -> Rejection.SLOW_CONSUMER;
            case "INVALID_MESSAGE", "PROTOCOL_MISMATCH" -> Rejection.PROTOCOL;
            case "ACCESS_DENIED", "ACCESS_EXPIRED" -> Rejection.ACCESS;
            case "BACKEND_UNAVAILABLE" -> Rejection.DATABASE;
            case "ROOM_CLOSED", "ROOM_FAILURE", "LAYOUT_UPGRADE_REQUIRED", "REALTIME_UNAVAILABLE" -> Rejection.ROOM;
            case "TRANSPORT_ERROR" -> Rejection.TRANSPORT;
            case "DISCONNECTED" -> Rejection.DISCONNECTED;
            case "SERVER_RESTART", "CONNECTION_REPLACED", "EMPTY" -> null;
            default -> Rejection.OTHER;
        };
        if (rejection != null) rejections.get(rejection).increment();
    }

    private enum Rejection { AUTHENTICATION, TIMEOUT, OVERLOAD, SLOW_CONSUMER, PROTOCOL, ACCESS, DATABASE, ROOM, TRANSPORT, DISCONNECTED, OTHER }
}

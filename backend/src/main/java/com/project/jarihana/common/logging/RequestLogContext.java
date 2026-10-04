package com.project.jarihana.common.logging;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.slf4j.MDC;

public final class RequestLogContext {
    private static final ThreadLocal<Map<String, Object>> CURRENT = new ThreadLocal<>();
    private static final Set<String> INVALID_FIELDS = Set.of("joinMethod", "capacity", "startsAt", "endsAt",
            "status", "groupMemberId", "size", "type", "relation", "role", "recruiting", "keyword", "cursor",
            "name", "description", "rejectReason", "fileName", "fileSize", "contentType");

    private RequestLogContext() { }

    static void begin(String requestId) {
        CURRENT.set(new LinkedHashMap<>());
        MDC.put("http.request.id", requestId);
        MDC.remove("user.id");
    }

    static void clear() { CURRENT.remove(); }

    public static void setMemberId(long memberId) {
        if (CURRENT.get() != null) { MDC.put("user.id", Long.toString(memberId)); }
    }

    public static void setAuthenticationFailure(String reason) {
        put("jarihana.auth_failure", reason);
    }

    public static void setAuthenticationFailureIfAbsent(String reason) {
        if (CURRENT.get() != null) { CURRENT.get().putIfAbsent("jarihana.auth_failure", reason); }
    }

    public static void setErrorCode(String code) { put("jarihana.error_code", code); }

    public static void setInvalidFields(Collection<String> fields) {
        put("jarihana.invalid_fields", fields.stream().filter(INVALID_FIELDS::contains).distinct().sorted().toList());
    }

    static void put(String key, Object value) {
        if (CURRENT.get() != null && value != null) { CURRENT.get().put(key, value); }
    }

    static Map<String, Object> snapshot() {
        return CURRENT.get() == null ? Map.of() : Map.copyOf(CURRENT.get());
    }
}

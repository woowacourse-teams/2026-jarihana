package com.project.jarihana.common.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

public class HttpRequestLoggingFilter extends OncePerRequestFilter {
    private static final Set<String> PATH_IDS = Set.of("groupId", "recruitmentId", "registrationId", "groupMemberId", "memberId");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Map<String, String> previous = MDC.getCopyOfContextMap();
        long started = System.nanoTime();
        String requestId = UUID.randomUUID().toString();
        RequestLogContext.begin(requestId);
        response.setHeader("X-Request-Id", requestId);
        boolean failed = false;
        try {
            Map<String, Object> initialFields = new LinkedHashMap<>(KnownRequestRoutes.fields(request));
            initialFields.put("http.request.method", safeMethod(request.getMethod()));
            Events.emit("http.request.started", "web", "start", "unknown", 0, initialFields);
            chain.doFilter(request, response);
        } catch (IOException | ServletException | RuntimeException | Error error) {
            failed = true;
            throw error;
        } finally {
            try {
                int status = failed ? 500 : response.getStatus();
                Map<String, Object> fields = new LinkedHashMap<>(KnownRequestRoutes.fields(request));
                fields.putAll(RequestLogContext.snapshot());
                if (status != 401 && status != 403) { fields.remove("jarihana.auth_failure"); }
                fields.put("http.request.method", safeMethod(request.getMethod()));
                fields.put("http.response.status_code", status);
                addRoute(request, fields);
                Events.emit("http.request.completed", "web", "end", status < 400 ? "success" : "failure",
                        System.nanoTime() - started, fields);
            } finally {
                RequestLogContext.clear();
                if (previous == null) { MDC.clear(); } else { MDC.setContextMap(previous); }
            }
        }
    }

    private String safeMethod(String method) {
        return Set.of("GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE").contains(method)
                ? method : "OTHER";
    }

    private void addRoute(HttpServletRequest request, Map<String, Object> fields) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern != null) {
            String route = pattern.toString();
            fields.put("jarihana.route", request.getContextPath() + route);
        }
        Object variables = request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        if (variables instanceof Map<?, ?> paths) {
            paths.forEach((key, value) -> {
                if (PATH_IDS.contains(key) && value instanceof String text && text.matches("[0-9]{1,18}")) {
                    fields.put("jarihana.path." + key, Long.parseLong(text));
                }
            });
        }
    }
}

package com.project.jarihana.common.logging;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class KnownRequestRoutes {
    private static final Pattern VARIABLE = Pattern.compile("\\{([^}]+)}");
    private static final List<Route> ROUTES = List.of(
            "/groups", "/groups/{groupId}", "/groups/{groupId}/leader", "/groups/{groupId}/members",
            "/groups/{groupId}/recurring-schedule", "/groups/{groupId}/session-schedule",
            "/groups/{groupId}/recruitments", "/groups/{groupId}/recruitments/{recruitmentId}",
            "/groups/{groupId}/registrations/summary", "/registrations",
            "/recruitments/{recruitmentId}/registrations", "/recruitments/{recruitmentId}/registrations/{registrationId}",
            "/recruitments/{recruitmentId}/registrations/read", "/members", "/members/me",
            "/auth/logout", "/auth/refresh", "/oauth/github/callback", "/image-uploads", "/feedbacks",
            "/share/groups/{groupId}"
    ).stream().map(KnownRequestRoutes::route).toList();

    private KnownRequestRoutes() { }

    static Map<String, Object> fields(HttpServletRequest request) {
        String context = request.getContextPath();
        String uri = request.getRequestURI();
        String path = uri.substring(context.length());
        for (Route route : ROUTES) {
            Matcher matcher = route.pattern().matcher(path);
            if (matcher.matches()) {
                Map<String, Object> fields = new LinkedHashMap<>();
                fields.put("jarihana.route", context + route.template());
                for (int index = 0; index < route.variables().size(); index++) {
                    fields.put("jarihana.path." + route.variables().get(index), Long.parseLong(matcher.group(index + 1)));
                }
                return fields;
            }
        }
        return Map.of();
    }

    static String sanitizeUrl(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            URI uri = URI.create(value);
            String path = uri.getRawPath();
            if (path == null) {
                return null;
            }

            String contextPath = "/api";
            if (path.startsWith(contextPath)) {
                path = path.substring(contextPath.length());
            }
            String routePath = path;
            String normalizedPath = ROUTES.stream()
                    .filter(route -> route.pattern().matcher(routePath).matches())
                    .map(Route::template)
                    .findFirst()
                    .orElse("/:redacted");
            String authority = uri.getRawAuthority();
            String origin = uri.getScheme() != null && authority != null
                    ? uri.getScheme() + "://" + authority
                    : "";
            return origin + contextPath + normalizedPath;
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private static Route route(String template) {
        Matcher matcher = VARIABLE.matcher(template);
        List<String> variables = new ArrayList<>();
        StringBuilder expression = new StringBuilder();
        int previous = 0;
        while (matcher.find()) {
            expression.append(Pattern.quote(template.substring(previous, matcher.start()))).append("([0-9]{1,18})");
            variables.add(matcher.group(1));
            previous = matcher.end();
        }
        expression.append(Pattern.quote(template.substring(previous)));
        return new Route(template, Pattern.compile(expression.toString()), List.copyOf(variables));
    }

    private record Route(String template, Pattern pattern, List<String> variables) { }
}

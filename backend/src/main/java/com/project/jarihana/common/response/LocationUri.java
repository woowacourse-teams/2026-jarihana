package com.project.jarihana.common.response;

import jakarta.servlet.http.HttpServletRequest;

import java.net.URI;
import java.util.Locale;

public final class LocationUri {

    private LocationUri() {
    }

    public static URI of(HttpServletRequest request, String resourcePathFormat, Object... pathVariables) {
        String resourcePath = String.format(Locale.ROOT, resourcePathFormat, pathVariables);
        return URI.create(request.getContextPath() + resourcePath);
    }
}

package com.project.jarihana.common.response;

import jakarta.servlet.http.HttpServletRequest;

import java.net.URI;

public final class LocationUri {

    private LocationUri() {
    }

    public static URI of(HttpServletRequest request, String resourcePath) {
        return URI.create(request.getContextPath() + resourcePath);
    }
}

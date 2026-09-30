package com.project.jarihana.common.response;

import java.net.URI;
import java.util.Locale;

public final class LocationUri {

    private LocationUri() {
    }

    public static URI of(String contextPath, String resourcePathFormat, Object... pathVariables) {
        String resourcePath = String.format(Locale.ROOT, resourcePathFormat, pathVariables);
        return URI.create(contextPath + resourcePath);
    }
}

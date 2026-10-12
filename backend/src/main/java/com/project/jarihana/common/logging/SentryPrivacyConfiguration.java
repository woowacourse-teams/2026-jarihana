package com.project.jarihana.common.logging;

import io.sentry.SentryOptions;
import io.sentry.protocol.Request;
import java.util.Map;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SentryPrivacyConfiguration {
    private static final Set<String> HTTP_METHODS = Set.of(
            "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"
    );

    @Bean
    SentryOptions.BeforeSendCallback sentryRequestPrivacyFilter() {
        return (event, hint) -> {
            event.setUser(null);

            Request request = event.getRequest();
            if (request != null) {
                request.setUrl(KnownRequestRoutes.sanitizeUrl(request.getUrl()));
                request.setMethod(safeMethod(request.getMethod()));
                request.setQueryString(null);
                request.setData(null);
                request.setCookies(null);
                request.setHeaders(Map.of());
                request.setEnvs(Map.of());
                request.setOthers(Map.of());
                request.setFragment(null);
                request.setBodySize(null);
            }

            return event;
        };
    }

    private String safeMethod(String method) {
        if (method == null) {
            return null;
        }
        String normalized = method.toUpperCase();
        return HTTP_METHODS.contains(normalized) ? normalized : "OTHER";
    }
}

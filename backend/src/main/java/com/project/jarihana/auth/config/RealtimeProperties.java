package com.project.jarihana.auth.config;

import java.net.URI;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.realtime")
public record RealtimeProperties(String websocketUrl) {
    public RealtimeProperties {
        if (websocketUrl == null || websocketUrl.isBlank()) {
            websocketUrl = "ws://localhost:8090/ws/realtime";
        }

        URI endpoint = URI.create(websocketUrl);
        String host = endpoint.getHost();
        boolean secure = "wss".equals(endpoint.getScheme());
        boolean local = "ws".equals(endpoint.getScheme()) && host != null
                && Set.of("localhost", "127.0.0.1", "[::1]").contains(host);
        if (host == null || (!secure && !local) || endpoint.getUserInfo() != null
                || endpoint.getQuery() != null || endpoint.getFragment() != null) {
            throw new IllegalArgumentException("실시간 접속 URL은 WSS 또는 로컬 개발용 WS 주소여야 합니다.");
        }
    }
}

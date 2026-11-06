package com.project.jarihana.gomoku.analytics;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.net.URI;

@ConfigurationProperties("gomoku.posthog")
public record GomokuPostHogSettings(boolean enabled, String projectToken, URI host) {

    public GomokuPostHogSettings {
        if (enabled && (projectToken == null || !projectToken.matches("phc_[A-Za-z0-9_-]+")
                || host == null || !"https".equalsIgnoreCase(host.getScheme()) || host.getHost() == null
                || host.getUserInfo() != null || host.getQuery() != null || host.getFragment() != null)) {
            throw new IllegalArgumentException("오목 분석을 활성화하려면 PostHog 프로젝트 토큰과 HTTPS 수집 주소가 필요합니다.");
        }
    }
}

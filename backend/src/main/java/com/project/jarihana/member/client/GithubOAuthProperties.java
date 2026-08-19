package com.project.jarihana.member.client;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "jarihana.oauth.github")
public record GithubOAuthProperties(
        String clientId,
        String clientSecret,
        String redirectUri,
        String tokenUri,
        String userUri
) {
}

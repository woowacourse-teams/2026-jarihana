package com.project.jarihana.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

@TestConfiguration
public class TestSupportConfig {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    public static final LocalDateTime FIXED_NOW = LocalDateTime.of(2026, 8, 19, 10, 0);

    @Bean
    @Primary
    public Clock fixedClock() {
        return Clock.fixed(FIXED_NOW.atZone(ZONE).toInstant(), ZONE);
    }

    @Bean
    @Primary
    public GithubOAuthClientStub githubOAuthClientStub() {
        return new GithubOAuthClientStub();
    }
}

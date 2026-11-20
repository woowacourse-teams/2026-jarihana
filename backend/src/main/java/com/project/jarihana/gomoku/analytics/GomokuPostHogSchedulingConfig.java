package com.project.jarihana.gomoku.analytics;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "gomoku.posthog", name = "enabled", havingValue = "true")
class GomokuPostHogSchedulingConfig {
    private final GomokuPostHogDispatcher dispatcher;

    @Bean(defaultCandidate = false)
    ThreadPoolTaskScheduler gomokuPostHogScheduler() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.setThreadNamePrefix("gomoku-posthog-");
        return scheduler;
    }

    @Bean
    static GomokuPostHogClient gomokuPostHogClient(GomokuPostHogSettings settings, Clock clock) {
        HttpClient transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(3));
        RestClient http = RestClient.builder()
                .requestFactory(factory)
                .baseUrl(settings.host().toString())
                .build();
        return new GomokuPostHogClient(http, settings.projectToken(), clock.getZone());
    }

    @Scheduled(fixedDelayString = "${gomoku.posthog.poll-delay:30s}",
            initialDelayString = "${gomoku.posthog.poll-delay:30s}", scheduler = "gomokuPostHogScheduler")
    public void dispatch() {
        try {
            dispatcher.deliverPending();
        } catch (RuntimeException exception) {
            var failure = log.atError()
                    .addKeyValue("event.action", "gomoku.posthog.delivery.failed")
                    .addKeyValue("error.type", exception.getClass().getName());
            if (exception instanceof RestClientResponseException response) {
                failure.addKeyValue("http.response.status_code", response.getStatusCode().value());
            }
            failure.log("Gomoku PostHog delivery failed and will be retried");
        }
    }
}

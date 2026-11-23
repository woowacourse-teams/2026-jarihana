package com.project.jarihana.auth.config;

import com.project.jarihana.auth.command.service.RefreshTokenCleaner;
import com.project.jarihana.auth.command.service.dto.RefreshTokenCleanupResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 만료된 Refresh Token 정리를 주기적으로 실행한다. Blue와 Green 두 앱이 함께 떠 있으면 양쪽에서 돌지만, 지울
 * 행을 {@code SKIP LOCKED}로 나누어 잠그므로 서로 기다리거나 같은 행을 두 번 지우지 않는다. 지우기만 하는
 * 작업이라 한쪽에서만 돌게 하는 처리 권한은 두지 않는다.
 *
 * <p>테스트처럼 여러 컨텍스트가 한 DB를 함께 쓰는 환경에서는 {@code enabled=false}로 끈다.
 */
@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableScheduling
@RequiredArgsConstructor
@ConditionalOnProperty(
        prefix = "jarihana.auth.refresh-token-cleanup",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true
)
public class RefreshTokenCleanupSchedulingConfig {

    private final RefreshTokenCleaner cleaner;

    @Scheduled(
            fixedDelayString = "${jarihana.auth.refresh-token-cleanup.interval:PT1H}",
            initialDelayString = "${jarihana.auth.refresh-token-cleanup.initial-delay:PT5M}"
    )
    public void removeExpiredRefreshTokens() {
        try {
            RefreshTokenCleanupResult result = cleaner.removeExpired();
            if (result.isEmpty()) {
                return;
            }
            log.atInfo()
                    .addKeyValue("event.action", "auth.refresh_token.cleanup.completed")
                    .addKeyValue("auth.refresh_token_family.removed", result.families())
                    .addKeyValue("auth.refresh_token.removed", result.familyTokens() + result.legacyTokens())
                    .log("Expired refresh tokens removed");
        } catch (RuntimeException exception) {
            log.atError()
                    .addKeyValue("event.action", "auth.refresh_token.cleanup.failed")
                    .addKeyValue("error.type", exception.getClass().getName())
                    .log("Refresh token cleanup cycle failed");
        }
    }
}

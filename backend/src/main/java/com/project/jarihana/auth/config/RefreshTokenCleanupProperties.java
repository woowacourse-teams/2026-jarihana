package com.project.jarihana.auth.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * 만료된 Refresh Token 정리 설정이다. 실행 여부({@code enabled})와 주기({@code interval})는
 * {@link RefreshTokenCleanupSchedulingConfig}가 직접 읽는다.
 *
 * <p>값이 없으면 기본값을 쓴다. 테스트 설정처럼 정리 블록을 두지 않은 환경에서도 정리 서비스는 만들어져야 한다.
 * 음수 여유 시간은 아직 쓸 수 있는 토큰을 지우게 하므로 기동을 막는다.
 */
@ConfigurationProperties(prefix = "jarihana.auth.refresh-token-cleanup")
public record RefreshTokenCleanupProperties(
        Duration gracePeriod,
        int batchSize
) {

    private static final Duration DEFAULT_GRACE_PERIOD = Duration.ofDays(1);
    private static final int DEFAULT_BATCH_SIZE = 100;

    public RefreshTokenCleanupProperties {
        gracePeriod = gracePeriod == null ? DEFAULT_GRACE_PERIOD : gracePeriod;
        if (gracePeriod.isNegative()) {
            throw new IllegalArgumentException("Refresh Token 정리 여유 시간은 음수일 수 없습니다.");
        }
        if (batchSize < 0) {
            throw new IllegalArgumentException("Refresh Token 정리 묶음 크기는 음수일 수 없습니다.");
        }
        batchSize = batchSize == 0 ? DEFAULT_BATCH_SIZE : batchSize;
    }
}

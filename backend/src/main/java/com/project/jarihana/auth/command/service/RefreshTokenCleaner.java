package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenFamilyRepository;
import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.RefreshTokenCleanupResult;
import com.project.jarihana.auth.config.RefreshTokenCleanupProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * 인증에 다시 쓰일 수 없는 Refresh Token 행을 지운다. 대상은 두 가지다.
 *
 * <ul>
 *     <li>절대 만료가 지난 패밀리와 그 패밀리의 토큰. 회전된 토큰은 재사용 감지에 쓰이므로 패밀리가 살아 있는
 *     동안에는 자기 만료가 지나도 남긴다. 폐기된 패밀리는 토큰이 이미 지워져 패밀리 행만 남아 있다.</li>
 *     <li>패밀리 없이 저장된 이전 행 중 자기 만료가 지난 행</li>
 * </ul>
 *
 * <p>둘 다 현재 시각에서 여유 시간을 뺀 시각을 기준으로 삼는다. 만료 직전에 시작한 갱신 요청이나 앱 사이의
 * 시계 차이와 겹치지 않게 하고, 폐기 사유를 만료 뒤에도 잠시 볼 수 있게 한다.
 *
 * <p>한 트랜잭션에서 지우는 수를 묶음 크기로 제한하고, 묶음이 가득 차면 새 트랜잭션에서 이어서 지운다. 잠금을
 * 짧게 유지해 같은 패밀리로 오는 로그아웃을 오래 막지 않는다.
 */
@Service
public class RefreshTokenCleaner {

    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenFamilyRepository refreshTokenFamilyRepository;
    private final RefreshTokenCleanupProperties properties;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public RefreshTokenCleaner(
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenFamilyRepository refreshTokenFamilyRepository,
            RefreshTokenCleanupProperties properties,
            Clock clock,
            PlatformTransactionManager transactionManager
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenFamilyRepository = refreshTokenFamilyRepository;
        this.properties = properties;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public RefreshTokenCleanupResult removeExpired() {
        LocalDateTime cutoff = LocalDateTime.now(clock).minus(properties.gracePeriod());
        int families = 0;
        int familyTokens = 0;
        RemovedFamilies removed;
        do {
            removed = Objects.requireNonNull(transactions.execute(status -> removeExpiredFamilies(cutoff)));
            families += removed.families();
            familyTokens += removed.tokens();
        } while (removed.locked() == properties.batchSize());

        int legacyTokens = 0;
        int removedLegacy;
        do {
            removedLegacy = Objects.requireNonNull(transactions.execute(status ->
                    refreshTokenRepository.removeExpiredWithoutFamily(cutoff, properties.batchSize())));
            legacyTokens += removedLegacy;
        } while (removedLegacy == properties.batchSize());
        return new RefreshTokenCleanupResult(families, familyTokens, legacyTokens);
    }

    private RemovedFamilies removeExpiredFamilies(LocalDateTime cutoff) {
        List<Long> familyIds = refreshTokenFamilyRepository.findExpiredIdsWithLock(cutoff, properties.batchSize());
        if (familyIds.isEmpty()) {
            return new RemovedFamilies(0, 0, 0);
        }
        int tokens = refreshTokenRepository.removeAllByFamilyIdIn(familyIds);
        int families = refreshTokenFamilyRepository.removeAllByIdIn(familyIds);
        return new RemovedFamilies(familyIds.size(), families, tokens);
    }

    private record RemovedFamilies(int locked, int families, int tokens) {
    }
}

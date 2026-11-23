package com.project.jarihana.auth.command.service;

import com.project.jarihana.auth.command.repository.RefreshTokenFamilyRepository;
import com.project.jarihana.auth.command.repository.RefreshTokenRepository;
import com.project.jarihana.auth.command.service.dto.RefreshTokenCleanupResult;
import com.project.jarihana.auth.config.RefreshTokenCleanupProperties;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

class RefreshTokenCleanerTest extends IntegrationTestSupport {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;
    private static final Duration GRACE = Duration.ofDays(1);

    @Autowired
    private RefreshTokenCleaner refreshTokenCleaner;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private RefreshTokenFamilyRepository refreshTokenFamilyRepository;

    @Autowired
    private MemberRepository memberRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private Clock clock;

    private Member member;

    @BeforeEach
    void setUp() {
        member = memberRepository.save(Member.create("가온", 8, "123456", Course.BACKEND));
    }

    @DisplayName("절대 만료에서 여유 시간이 지난 패밀리는 회전된 토큰과 최신 토큰까지 함께 지운다.")
    @Test
    void removeFamilyPastAbsoluteExpiryWithItsTokens() {
        // Given
        LocalDateTime absoluteExpiresAt = NOW.minus(GRACE).minusMinutes(1);
        long family = insertFamily(absoluteExpiresAt);
        insertToken(family, "expired-rotated", absoluteExpiresAt.minusDays(2), absoluteExpiresAt.minusDays(2));
        insertToken(family, "expired-current", absoluteExpiresAt, null);

        // When
        RefreshTokenCleanupResult result = refreshTokenCleaner.removeExpired();

        // Then
        assertThat(familyIds()).doesNotContain(family);
        assertThat(tokenHashes()).isEmpty();
        assertThat(result).isEqualTo(new RefreshTokenCleanupResult(1, 2, 0));
    }

    @DisplayName("절대 만료가 지났어도 여유 시간 안이면 패밀리와 토큰을 남긴다.")
    @Test
    void keepFamilyWithinGraceAfterAbsoluteExpiry() {
        // Given
        LocalDateTime absoluteExpiresAt = NOW.minus(GRACE).plusMinutes(1);
        long family = insertFamily(absoluteExpiresAt);
        insertToken(family, "recently-expired", absoluteExpiresAt, null);

        // When
        RefreshTokenCleanupResult result = refreshTokenCleaner.removeExpired();

        // Then
        assertThat(familyIds()).containsExactly(family);
        assertThat(tokenHashes()).containsExactly("recently-expired");
        assertThat(result).isEqualTo(new RefreshTokenCleanupResult(0, 0, 0));
    }

    @DisplayName("살아 있는 패밀리의 회전된 토큰은 자기 만료가 지났어도 재사용 감지에 쓰도록 남긴다.")
    @Test
    void keepRotatedTokensOfLiveFamily() {
        // Given
        long family = insertFamily(NOW.plusDays(13));
        LocalDateTime rotatedAt = NOW.minusDays(1);
        insertToken(family, "live-rotated", rotatedAt.plusSeconds(10), rotatedAt);
        insertToken(family, "live-current", NOW.plusDays(13), null);

        // When
        refreshTokenCleaner.removeExpired();

        // Then
        assertThat(familyIds()).containsExactly(family);
        assertThat(tokenHashes()).containsExactlyInAnyOrder("live-rotated", "live-current");
    }

    @DisplayName("폐기된 패밀리는 절대 만료에서 여유 시간이 지날 때까지 사유와 함께 남기고, 그 뒤에 지운다.")
    @Test
    void removeRevokedFamilyOnlyAfterAbsoluteExpiry() {
        // Given
        long expiredRevoked = insertRevokedFamily(NOW.minus(GRACE).minusMinutes(1), "REUSE_DETECTED");
        long liveRevoked = insertRevokedFamily(NOW.plusDays(3), "LOGOUT");

        // When
        RefreshTokenCleanupResult result = refreshTokenCleaner.removeExpired();

        // Then
        assertThat(familyIds()).containsExactly(liveRevoked).doesNotContain(expiredRevoked);
        assertThat(result).isEqualTo(new RefreshTokenCleanupResult(1, 0, 0));
    }

    @DisplayName("패밀리 없이 저장된 이전 토큰은 자기 만료에서 여유 시간이 지난 행만 지운다.")
    @Test
    void removeLegacyTokensPastExpiry() {
        // Given
        insertToken(null, "legacy-expired", NOW.minus(GRACE).minusMinutes(1), null);
        insertToken(null, "legacy-within-grace", NOW.minusHours(1), null);
        insertToken(null, "legacy-active", NOW.plusDays(5), null);

        // When
        RefreshTokenCleanupResult result = refreshTokenCleaner.removeExpired();

        // Then
        assertThat(tokenHashes()).containsExactlyInAnyOrder("legacy-within-grace", "legacy-active");
        assertThat(result).isEqualTo(new RefreshTokenCleanupResult(0, 0, 1));
    }

    @DisplayName("한 번에 지울 수보다 대상이 많아도 한 번 실행할 때 나누어 모두 지운다.")
    @Test
    void removeAllTargetsAcrossBatches() {
        // Given
        RefreshTokenCleaner smallBatchCleaner = cleanerWithBatchSize(2);
        LocalDateTime expired = NOW.minus(GRACE).minusMinutes(1);
        for (int index = 0; index < 5; index++) {
            long family = insertFamily(expired);
            insertToken(family, "family-token-" + index, expired, null);
            insertToken(null, "legacy-token-" + index, expired, null);
        }

        // When
        RefreshTokenCleanupResult result = smallBatchCleaner.removeExpired();

        // Then
        assertThat(familyIds()).isEmpty();
        assertThat(tokenHashes()).isEmpty();
        assertThat(result).isEqualTo(new RefreshTokenCleanupResult(5, 5, 5));
    }

    @DisplayName("다른 앱의 정리나 로그아웃이 잠근 패밀리는 기다리지 않고 건너뛴다.")
    @Test
    void skipFamilyLockedByAnotherTransaction() throws Exception {
        // Given
        LocalDateTime expired = NOW.minus(GRACE).minusMinutes(1);
        long locked = insertFamily(expired);
        insertToken(locked, "locked-token", expired, null);
        long free = insertFamily(expired);
        insertToken(free, "free-token", expired, null);
        CountDownLatch acquired = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<?> holder = executor.submit(() -> new TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> {
                    jdbcTemplate.queryForObject("select id from refresh_token_family where id = ? for update",
                            Long.class, locked);
                    acquired.countDown();
                    awaitQuietly(release);
                }));

        try {
            assertThat(acquired.await(5, TimeUnit.SECONDS)).isTrue();

            // When
            RefreshTokenCleanupResult result = assertTimeoutPreemptively(
                    Duration.ofSeconds(5), refreshTokenCleaner::removeExpired);

            // Then
            assertThat(result).isEqualTo(new RefreshTokenCleanupResult(1, 1, 0));
        } finally {
            release.countDown();
            holder.get(5, TimeUnit.SECONDS);
            executor.shutdownNow();
        }
        assertThat(familyIds()).containsExactly(locked);
        assertThat(tokenHashes()).containsExactly("locked-token");
    }

    private RefreshTokenCleaner cleanerWithBatchSize(int batchSize) {
        return new RefreshTokenCleaner(
                refreshTokenRepository,
                refreshTokenFamilyRepository,
                new RefreshTokenCleanupProperties(GRACE, batchSize),
                clock,
                transactionManager);
    }

    private long insertFamily(LocalDateTime absoluteExpiresAt) {
        return jdbcTemplate.queryForObject("""
                        insert into refresh_token_family (created_at, updated_at, member_id, absolute_expires_at)
                        values (?, ?, ?, ?)
                        returning id
                        """,
                Long.class, NOW.minusDays(20), NOW.minusDays(20), member.getId(), absoluteExpiresAt);
    }

    private long insertRevokedFamily(LocalDateTime absoluteExpiresAt, String reason) {
        return jdbcTemplate.queryForObject("""
                        insert into refresh_token_family
                            (created_at, updated_at, member_id, absolute_expires_at, revoked_at, revoke_reason)
                        values (?, ?, ?, ?, ?, ?)
                        returning id
                        """,
                Long.class, NOW.minusDays(20), NOW.minusDays(10), member.getId(), absoluteExpiresAt,
                NOW.minusDays(10), reason);
    }

    /**
     * 해시 대신 읽기 쉬운 이름을 넣는다. 정리는 해시 값을 보지 않는다.
     */
    private void insertToken(Long familyId, String tokenHash, LocalDateTime expiresAt, LocalDateTime rotatedAt) {
        jdbcTemplate.update("""
                        insert into refresh_token
                            (created_at, updated_at, expires_at, token_hash, member_id, refresh_token_family_id, rotated_at)
                        values (?, ?, ?, ?, ?, ?, ?)
                        """,
                NOW.minusDays(20), NOW.minusDays(20), expiresAt, tokenHash, member.getId(), familyId, rotatedAt);
    }

    private List<Long> familyIds() {
        return jdbcTemplate.queryForList("select id from refresh_token_family order by id", Long.class);
    }

    private List<String> tokenHashes() {
        return jdbcTemplate.queryForList("select token_hash from refresh_token order by id", String.class);
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }
}

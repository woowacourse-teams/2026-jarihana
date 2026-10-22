package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.PushDeliveryWorkRepository;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.hibernate.cfg.AvailableSettings;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.data.jpa.repository.Query;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Types;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(PushDeliveryWorkRepositoryTest.SqlCaptureConfiguration.class)
class PushDeliveryWorkRepositoryTest extends PushIntegrationTestSupport {

    @Autowired private PushDeliveryLeaseService leases;
    @Autowired private PushDeliveryWorkRepository work;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private RecordingInspector inspector;

    @Test
    @DisplayName("네 작업을 선점하고 전송 정보를 준비할 때 SQL을 두 번만 실행한다.")
    void batchClaimAndPrepareUseTwoStatements() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "batch");
        for (int index = 0; index < 5; index++) {
            deliveries.save(NotificationDelivery.create(notification(owner, "batch-" + index),
                    subscription, NOW, NOW.plusDays(1)));
        }
        var claimed = new AtomicReference<List<DeliveryClaim>>();
        var prepared = new AtomicReference<List<PushRequest>>();

        // When
        var statements = inspector.capture(() -> {
            claimed.set(leases.claimNext(4));
            prepared.set(leases.prepare(claimed.get()));
        });

        // Then
        assertThat(statements).hasSize(2);
        assertThat(claimed.get()).hasSize(4).allSatisfy(claim -> {
            assertThat(claim.status()).isEqualTo(DeliveryStatus.IN_FLIGHT);
            assertThat(claim.token()).isNotNull();
            assertThat(claim.attemptCount()).isEqualTo(1);
        });
        assertThat(prepared.get()).hasSize(4).extracting(PushRequest::deliveryId)
                .containsExactlyInAnyOrderElementsOf(claimed.get().stream().map(DeliveryClaim::id).toList());
        assertThat(jdbc.queryForObject(
                "select count(*) from notification_deliveries where status = 'PENDING'", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("혼합 배치의 오래된 토큰과 만료 lease는 보존하고 무효 대상은 한 번에 종료한다.")
    void batchPrepareFencesStaleClaimsAndCancelsInvalidTargets() {
        // Given
        var owner = member("101");
        var anotherOwner = member("102");
        List<NotificationDelivery> pending = new ArrayList<>();
        for (int index = 0; index < 7; index++) {
            pending.add(deliveries.save(NotificationDelivery.create(notification(owner, "mixed-" + index),
                    subscription(owner, "mixed-" + index), NOW, NOW.plusDays(1))));
        }
        var claims = leases.claimNext(7);
        UUID replacement = UUID.randomUUID();
        jdbc.update("update notification_deliveries set lease_token = ? where id = ?", replacement, pending.get(1).getId());
        jdbc.update("update push_subscriptions set generation = generation + 1 where id = ?",
                pending.get(2).getPushSubscription().getId());
        jdbc.update("update notification_deliveries set created_at = ?, expires_at = ? where id = ?",
                NOW.minusDays(1), NOW, pending.get(3).getId());
        jdbc.update("update notification_deliveries set locked_until = ? where id = ?",
                NOW.minusSeconds(1), pending.get(4).getId());
        jdbc.update("update notifications set deleted_at = ? where id = ?", NOW, pending.get(5).getNotification().getId());
        jdbc.update("update notifications set member_id = ? where id = ?",
                anotherOwner.getId(), pending.get(6).getNotification().getId());
        var prepared = new AtomicReference<List<PushRequest>>();

        // When
        var statements = inspector.capture(() -> prepared.set(leases.prepare(claims)));

        // Then
        assertThat(statements).hasSize(2);
        assertThat(prepared.get()).extracting(PushRequest::deliveryId).containsExactly(pending.getFirst().getId());
        assertThat(deliveries.findById(pending.get(1).getId()).orElseThrow().getLeaseToken()).isEqualTo(replacement);
        assertThat(deliveries.findById(pending.get(4).getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        assertThat(deliveries.findById(pending.get(3).getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.FAILED);
        for (int index : List.of(2, 5, 6)) {
            var cancelled = deliveries.findById(pending.get(index).getId()).orElseThrow();
            assertThat(cancelled.getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
            assertThat(cancelled.getLeaseToken()).isNull();
        }
    }

    @Test
    @DisplayName("서로 다른 배치의 토큰을 바꿔 넣어도 다른 작업을 준비하거나 취소하지 못한다.")
    void batchPrepareMatchesEachIdToItsOwnToken() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "tokens");
        for (int index = 0; index < 2; index++) {
            deliveries.save(NotificationDelivery.create(notification(owner, "tokens-" + index),
                    subscription, NOW, NOW.plusDays(1)));
        }
        var first = leases.claimNext().orElseThrow();
        var second = leases.claimNext().orElseThrow();
        var forged = List.of(
                new DeliveryClaim(first.id(), second.token(), first.status(), first.attemptCount()),
                new DeliveryClaim(second.id(), first.token(), second.status(), second.attemptCount()));

        // When
        var prepared = leases.prepare(forged);

        // Then
        assertThat(prepared).isEmpty();
        assertThat(leases.prepare(List.of(first, second))).hasSize(2);
    }

    @Test
    @DisplayName("두 트랜잭션이 동시에 배치 선점해도 잠긴 작업을 건너뛰고 서로 다른 작업을 가져간다.")
    void concurrentBatchesSkipLocksWithoutOverlappingClaims() throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "concurrent-batch");
        for (int index = 0; index < 8; index++) {
            var delivery = deliveries.save(NotificationDelivery.create(notification(owner, "concurrent-" + index),
                    subscription, NOW, NOW.plusDays(1)));
            if (index % 2 == 1) {
                jdbc.update("""
                        update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 1,
                            lease_token = ?, locked_until = ? where id = ?
                        """, UUID.randomUUID(), NOW.minusSeconds(1), delivery.getId());
            }
        }
        var claimed = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var batch = leases.claimNext(2);
                claimed.countDown();
                await(release);
                return batch;
            }));
            try {
                assertThat(claimed.await(10, TimeUnit.SECONDS)).isTrue();
                // When
                var second = executor.submit(() -> leases.claimNext(2)).get(10, TimeUnit.SECONDS);
                release.countDown();
                var firstBatch = first.get(10, TimeUnit.SECONDS);
                // Then
                assertThat(firstBatch).hasSize(2);
                assertThat(second).hasSize(2).extracting(DeliveryClaim::id)
                        .doesNotContainAnyElementsOf(firstBatch.stream().map(DeliveryClaim::id).toList());
            } finally {
                release.countDown();
            }
        }
    }

    @Test
    @DisplayName("결과 저장은 선점 때 반환한 시도 횟수를 사용하고 이전 lease의 응답은 무시한다.")
    void finishUsesClaimAttemptCountAndFencesOldLease() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "finish");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "finish"),
                subscription, NOW, NOW.plusDays(1)));
        var old = leases.claimNext().orElseThrow();
        var oldRequest = leases.prepare(old).orElseThrow();
        jdbc.update("update notification_deliveries set locked_until = ?, attempt_count = 4 where id = ?",
                NOW.minusSeconds(1), pending.getId());
        var current = leases.claimNext(1).getFirst();
        var currentRequest = leases.prepare(List.of(current)).getFirst();

        // When
        var statements = inspector.capture(() -> {
            leases.finish(old, oldRequest, new PushResult(PushResult.Outcome.GONE, "HTTP_410", null));
            leases.finish(current, currentRequest, new PushResult(PushResult.Outcome.RETRY, "NETWORK_ERROR", null));
        });

        // Then
        assertThat(current.attemptCount()).isEqualTo(5);
        assertThat(statements).noneMatch(sql -> sql.toLowerCase().contains("select attempt_count"));
        assertThat(subscriptions.findByIdAndMemberId(subscription.getId(), owner.getId()).orElseThrow().isEnabled()).isTrue();
        var stored = deliveries.findById(pending.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(DeliveryStatus.FAILED);
        assertThat(stored.getAttemptCount()).isEqualTo(5);
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("Latch timed out");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }

    @Test
    @DisplayName("JPA로 작업을 원자적으로 선점하고 UUID와 전송 정보를 정확히 반환한다.")
    void claimAndPrepareThroughJpaWithoutLosingReturnedFields() {
        // Given
        var owner = member("101");
        var notification = notification(owner, "first");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification, subscription, NOW, NOW.plusDays(1)));
        var claimed = new AtomicReference<DeliveryClaim>();
        var sendable = new AtomicReference<PushRequest>();

        // When
        List<String> statements = inspector.capture(() -> {
            var claim = leases.claimNext().orElseThrow();
            claimed.set(claim);
            sendable.set(leases.prepare(claim).orElseThrow());
        });

        // Then
        assertThat(statements).anyMatch(sql -> sql.toLowerCase().contains("skip locked")
                && sql.toLowerCase().contains("returning"));
        assertThat(claimed.get().id()).isEqualTo(pending.getId());
        assertThat(claimed.get().token()).isNotNull();
        assertThat(claimed.get().status()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        assertThat(sendable.get()).isEqualTo(new PushRequest(pending.getId(), notification.getId(), subscription.getId(),
                subscription.getGeneration(), notification.getPayloadVersion(), subscription.getEndpoint(),
                subscription.getP256dh(), subscription.getAuth(), NOW.plusDays(1)));
        var stored = deliveries.findById(pending.getId()).orElseThrow();
        assertThat(stored.getLeaseToken()).isEqualTo(claimed.get().token());
        assertThat(stored.getLockedUntil()).isAfter(NOW);
        assertThat(work.attemptCount(pending.getId())).isEqualTo(1);
    }

    @ParameterizedTest
    @EnumSource(value = DeliveryStatus.class, names = {"FAILED", "CANCELLED"})
    @DisplayName("만료되거나 삭제된 작업을 선점하면 종료 상태와 빈 lease 토큰을 반환한다.")
    void claimReturnsTerminalStatusWithNullToken(DeliveryStatus expected) {
        // Given
        var owner = member("101");
        var notification = notification(owner, "first");
        var pending = deliveries.save(NotificationDelivery.create(notification, subscription(owner, "one"), NOW, NOW.plusDays(1)));
        if (expected == DeliveryStatus.FAILED) {
            jdbc.update("update notification_deliveries set created_at = ?, expires_at = ? where id = ?",
                    NOW.minusDays(2), NOW.minusDays(1), pending.getId());
        } else {
            notifications.save(notification.delete(NOW));
        }

        // When
        var claim = leases.claimNext().orElseThrow();

        // Then
        assertThat(claim.id()).isEqualTo(pending.getId());
        assertThat(claim.status()).isEqualTo(expected);
        assertThat(claim.token()).isNull();
        assertThat(work.attemptCount(pending.getId())).isZero();
        assertThat(leases.claimNext()).isEmpty();
    }

    @Test
    @DisplayName("선점 후 구독이 해제되면 전송 준비를 취소하고 lease를 해제한다.")
    void prepareCancelsSubscriptionDisabledAfterClaim() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        var claim = leases.claimNext().orElseThrow();
        subscriptions.save(subscription.disable(NOW));

        // When
        var request = leases.prepare(claim);

        // Then
        assertThat(request).isEmpty();
        var stored = deliveries.findById(pending.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(stored.getLeaseToken()).isNull();
        assertThat(stored.getLockedUntil()).isNull();
        assertThat(stored.getLastErrorCode()).isEqualTo("STALE_TARGET");
    }

    @Test
    @DisplayName("선점 트랜잭션이 롤백되면 작업은 시도 횟수 증가 없이 대기로 남는다.")
    void rollbackRestoresPendingDelivery() {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "first"),
                subscription(owner, "one"), NOW, NOW.plusDays(1)));

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            assertThat(leases.claimNext()).isPresent();
            status.setRollbackOnly();
        });

        // Then
        var stored = deliveries.findById(pending.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(stored.getAttemptCount()).isZero();
        assertThat(stored.getLeaseToken()).isNull();
    }

    @Test
    @DisplayName("대기 작업이 없으면 빈 선점 결과를 반환한다.")
    void emptyQueueReturnsEmptyClaim() {
        // Given & When & Then
        assertThat(leases.claimNext()).isEmpty();
    }

    @Test
    @DisplayName("대량 대기에서도 인덱스로 후보를 좁힌 뒤 알림을 조회한다.")
    void claimUsesDueIndexBeforeJoiningLargeBacklog() throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "backlog");
        jdbc.update("""
                insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
                select ?, 'claim-plan-' || series, 'REGISTRATION_APPROVED', 1, '{}'::jsonb, ?, ?
                from generate_series(1, 20000) series
                """, owner.getId(), NOW, NOW);
        jdbc.update("""
                insert into notification_deliveries (notification_id, push_subscription_id, subscription_generation,
                    status, attempt_count, next_attempt_at, expires_at, created_at, updated_at)
                select id, ?, 1, 'PENDING', 0, ?, ?, ?, ? from notifications
                """, subscription.getId(), NOW, NOW.plusDays(1), NOW, NOW);
        jdbc.execute("analyze notifications");
        jdbc.execute("analyze notification_deliveries");
        jdbc.execute("analyze push_subscriptions");
        String sql = PushDeliveryWorkRepository.class
                .getMethod("claimNextRows", LocalDateTime.class, LocalDateTime.class, UUID.class, int.class)
                .getAnnotation(Query.class).value();
        var parameters = new MapSqlParameterSource()
                .addValue("now", NOW, Types.TIMESTAMP)
                .addValue("lockedUntil", NOW.plusMinutes(1), Types.TIMESTAMP)
                .addValue("token", UUID.randomUUID(), Types.OTHER)
                .addValue("limit", 4);

        // When
        String plan = new NamedParameterJdbcTemplate(jdbc)
                .queryForObject("explain (format json) " + sql, parameters, String.class);

        // Then
        assertThat(plan).contains("\"Index Name\": \"idx_notification_deliveries_due\"",
                "\"Index Name\": \"notifications_pkey\"");
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'PENDING'", Long.class))
                .isEqualTo(20000);
    }

    @Test
    @DisplayName("대기와 재시도와 만료 선점을 발송 예정 시각과 ID 순서로 함께 선택한다.")
    void claimKeepsGlobalOrderAcrossDueAndExpiredLeases() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "order");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "pending"), subscription, NOW, NOW.plusDays(1)));
        var retry = deliveries.save(NotificationDelivery.create(notification(owner, "retry"), subscription, NOW, NOW.plusDays(1)));
        var expired = deliveries.save(NotificationDelivery.create(notification(owner, "expired"), subscription, NOW, NOW.plusDays(1)));
        var future = deliveries.save(NotificationDelivery.create(notification(owner, "future"), subscription, NOW, NOW.plusDays(1)));
        var active = deliveries.save(NotificationDelivery.create(notification(owner, "active"), subscription, NOW, NOW.plusDays(1)));
        jdbc.update("update notification_deliveries set next_attempt_at = ? where id = ?", NOW.minusMinutes(1), pending.getId());
        jdbc.update("update notification_deliveries set status = 'RETRY', attempt_count = 1, next_attempt_at = ? where id = ?",
                NOW.minusMinutes(1), retry.getId());
        jdbc.update("""
                update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 1,
                    lease_token = ?, locked_until = ?, next_attempt_at = ? where id = ?
                """, UUID.randomUUID(), NOW.minusSeconds(1), NOW.minusMinutes(2), expired.getId());
        jdbc.update("update notification_deliveries set next_attempt_at = ? where id = ?", NOW.plusMinutes(1), future.getId());
        jdbc.update("""
                update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 1,
                    lease_token = ?, locked_until = ?, next_attempt_at = ? where id = ?
                """, UUID.randomUUID(), NOW.plusSeconds(1), NOW.minusMinutes(3), active.getId());

        // When
        var batch = leases.claimNext(2);
        var first = batch.getFirst();
        var second = batch.get(1);
        var third = leases.claimNext().orElseThrow();

        // Then
        assertThat(List.of(first.id(), second.id(), third.id()))
                .containsExactly(expired.getId(), pending.getId(), retry.getId());
        assertThat(leases.claimNext()).isEmpty();
        assertThat(work.attemptCount(expired.getId())).isEqualTo(2);
    }

    @Test
    @DisplayName("빈 슬롯이 없으면 SQL 없이 반환하고 음수 선점 수는 거절한다.")
    void zeroCapacitySkipsSqlAndNegativeCapacityIsRejected() {
        // Given & When
        var statements = inspector.capture(() -> {
            assertThat(leases.claimNext(0)).isEmpty();
            assertThat(leases.prepare(List.of())).isEmpty();
        });

        // Then
        assertThat(statements).isEmpty();
        assertThatThrownBy(() -> leases.claimNext(-1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("없는 작업의 시도 횟수 조회는 기존과 같은 빈 결과 예외를 반환한다.")
    void missingAttemptCountKeepsEmptyResultException() {
        // Given & When & Then
        assertThatThrownBy(() -> work.attemptCount(Long.MAX_VALUE)).isInstanceOf(EmptyResultDataAccessException.class);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SqlCaptureConfiguration {
        @Bean
        RecordingInspector pushWorkSqlInspector() {
            return new RecordingInspector();
        }

        @Bean
        HibernatePropertiesCustomizer capturePushWorkSql(RecordingInspector inspector) {
            return properties -> properties.put(AvailableSettings.STATEMENT_INSPECTOR, inspector);
        }
    }

    static class RecordingInspector implements StatementInspector {
        private final ThreadLocal<List<String>> recording = new ThreadLocal<>();

        List<String> capture(Runnable action) {
            List<String> statements = new ArrayList<>();
            recording.set(statements);
            try {
                action.run();
                return List.copyOf(statements);
            } finally {
                recording.remove();
            }
        }

        @Override
        public String inspect(String sql) {
            var statements = recording.get();
            if (statements != null) {
                statements.add(sql);
            }
            return sql;
        }
    }
}

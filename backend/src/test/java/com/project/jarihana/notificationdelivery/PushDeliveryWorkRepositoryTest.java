package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
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

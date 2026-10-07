package com.project.jarihana.notificationdelivery;

import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.client.dto.PushResult.Outcome;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Import(PushTransportTestConfig.class)
class PushDeliveryWorkerTest extends PushIntegrationTestSupport {
    @Autowired private PushDeliveryWorker worker;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushTransportStub transport;

    @BeforeEach
    void resetTransport() { transport.reset(); }

    @Test
    @DisplayName("각 구독에 TX 밖에서 전송하고 실패한 구독만 재시도를 예약한다.")
    void sendEachSubscriptionIndependentlyOutsideTransaction() {
        // Given
        Member owner = member("101");
        var notification = notification(owner, "event");
        var success = subscription(owner, "success");
        var failed = subscription(owner, "failed");
        var first = deliveries.save(NotificationDelivery.create(notification, success, NOW, NOW.plusDays(1)));
        var second = deliveries.save(NotificationDelivery.create(notification, failed, NOW, NOW.plusDays(1)));
        transport.respond(request -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return request.subscriptionId() == success.getId() ? PushResult.accepted() : new PushResult(Outcome.RETRY, "HTTP_503", Duration.ofSeconds(60));
        });
        // When
        worker.processDue();
        // Then
        assertThat(transport.requests()).hasSize(2);
        assertThat(status(first)).isEqualTo(DeliveryStatus.ACCEPTED);
        assertThat(status(second)).isEqualTo(DeliveryStatus.RETRY);
        assertThat(deliveries.findById(second.getId()).orElseThrow().getNextAttemptAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(deliveries.findById(first.getId()).orElseThrow().getAcceptedAt()).isEqualTo(NOW);
        assertThat(deliveries.findById(first.getId()).orElseThrow().getLeaseToken()).isNull();
    }

    @Test
    @DisplayName("전송 전 만료된 작업은 시도 횟수 0으로 실패하고 외부 요청을 하지 않는다.")
    void expireBeforeFirstAttempt() {
        // Given
        Member owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription(owner, "one"), NOW, NOW.plusDays(1)));
        jdbc.update("update notification_deliveries set created_at = ?, expires_at = ? where id = ?",
                NOW.minusDays(2), NOW.minusDays(1), pending.getId());
        // When
        worker.processDue();
        // Then
        assertThat(status(pending)).isEqualTo(DeliveryStatus.FAILED);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getAttemptCount()).isZero();
        assertThat(transport.requests()).isEmpty();
    }

    @Test
    @DisplayName("연결 해제 뒤 늦게 저장된 과거 버전 작업도 전송 직전 검증으로 취소한다.")
    void cancelLateOldGenerationDelivery() {
        // Given
        Member owner = member("101");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription, NOW, NOW.plusDays(1)));
        subscriptions.save(subscription.disable(NOW));
        // When
        worker.processDue();
        // Then
        assertThat(status(pending)).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(transport.requests()).isEmpty();
    }

    @Test
    @DisplayName("일시 실패를 최초 포함 5번 시도하면 종료하고 더는 전송하지 않는다.")
    void stopAtFiveTotalAttempts() {
        // Given
        Member owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription(owner, "one"), NOW, NOW.plusDays(1)));
        transport.respond(request -> new PushResult(Outcome.RETRY, "HTTP_503", null));
        // When
        for (int i = 0; i < 5; i++) {
            worker.processDue();
            jdbc.update("update notification_deliveries set next_attempt_at = ? where id = ?", NOW, pending.getId());
        }
        worker.processDue();
        // Then
        assertThat(transport.requests()).hasSize(5);
        assertThat(status(pending)).isEqualTo(DeliveryStatus.FAILED);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getAttemptCount()).isEqualTo(5);
    }

    @Test
    @DisplayName("구독 만료 응답은 해당 구독만 해제하고 그 연결의 나머지 작업을 취소한다.")
    void goneDisablesOnlyAffectedSubscription() {
        // Given
        Member owner = member("101");
        var subscription = subscription(owner, "one");
        var other = subscription(owner, "other");
        var first = deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        var remaining = deliveries.save(NotificationDelivery.create(notification(owner, "second"), subscription, NOW, NOW.plusDays(1)));
        transport.respond(request -> new PushResult(Outcome.GONE, "HTTP_410", null));
        // When
        worker.processDue();
        // Then
        assertThat(status(first)).isEqualTo(DeliveryStatus.FAILED);
        assertThat(status(remaining)).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(subscriptions.findByIdAndMemberId(subscription.getId(), owner.getId()).orElseThrow().isEnabled()).isFalse();
        assertThat(subscriptions.findByIdAndMemberId(other.getId(), owner.getId()).orElseThrow().isEnabled()).isTrue();
        assertThat(transport.requests()).hasSize(1);
    }

    @ParameterizedTest
    @CsvSource({"1,ACCEPTED,2", "5,FAILED,5"})
    @DisplayName("선점이 만료된 작업은 새 토큰으로 복구하되 재시도 상한을 넘지 않는다.")
    void recoverExpiredLeaseWithAttemptLimit(int attempts, DeliveryStatus expected, int count) {
        // Given
        Member owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription(owner, "one"), NOW, NOW.plusDays(1)));
        UUID oldToken = UUID.randomUUID();
        jdbc.update("""
                update notification_deliveries set status = 'IN_FLIGHT', attempt_count = ?, lease_token = ?, locked_until = ?
                where id = ?
                """, attempts, oldToken, NOW.minusSeconds(1), pending.getId());
        // When
        worker.processDue();
        // Then
        assertThat(status(pending)).isEqualTo(expected);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getAttemptCount()).isEqualTo(count);
        assertThat(transport.requests()).hasSize(expected == DeliveryStatus.ACCEPTED ? 1 : 0);
    }

    @Test
    void retryAfterBeyondRepresentableDateEndsWithoutOverflow() {
        // Given
        Member owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription(owner, "one"), NOW, NOW.plusDays(1)));
        transport.respond(request -> new PushResult(Outcome.RETRY, "HTTP_429", Duration.ofSeconds(Long.MAX_VALUE)));
        // When
        worker.processDue();
        // Then
        assertThat(status(pending)).isEqualTo(DeliveryStatus.FAILED);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getAttemptCount()).isEqualTo(1);
        assertThat(transport.requests()).hasSize(1);
    }

    @Test
    @DisplayName("삭제된 알림과 유효기간 이후로 미뤄진 재시도는 외부 요청 없이 종료한다.")
    void deletedNotificationAndRetryAfterDeadlineEnd() {
        // Given
        Member owner = member("101");
        var notification = notification(owner, "deleted");
        var subscription = subscription(owner, "one");
        var deleted = deliveries.save(NotificationDelivery.create(notification, subscription, NOW, NOW.plusDays(1)));
        notifications.save(notification.delete(NOW));
        var retry = deliveries.save(NotificationDelivery.create(notification(owner, "retry"), subscription, NOW, NOW.plusSeconds(30)));
        transport.respond(request -> new PushResult(Outcome.RETRY, "HTTP_429", Duration.ofHours(1)));
        // When
        worker.processDue();
        // Then
        assertThat(status(deleted)).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(status(retry)).isEqualTo(DeliveryStatus.FAILED);
        assertThat(transport.requests()).hasSize(1);
        assertThat(jdbc.queryForObject("select updated_at from notification_deliveries where id = ?", Timestamp.class, retry.getId()).toLocalDateTime()).isEqualTo(NOW);
    }

    private DeliveryStatus status(NotificationDelivery item) {
        return deliveries.findById(item.getId()).orElseThrow().getStatus();
    }
}

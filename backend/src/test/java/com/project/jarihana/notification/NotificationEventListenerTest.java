package com.project.jarihana.notification;

import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.recruitment.domain.GroupRecruitment;
import com.project.jarihana.recruitment.domain.JoinMethod;
import com.project.jarihana.registration.command.repository.RegistrationCommandRepository;
import com.project.jarihana.registration.domain.Registration;
import com.project.jarihana.registration.domain.event.RegistrationSubmittedEvent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class NotificationEventListenerTest extends NotificationIntegrationTestSupport {

    @Autowired private ApplicationEventPublisher events;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private RegistrationCommandRepository registrations;

    @Test
    @DisplayName("트랜잭션 안의 사건은 커밋 전 리스너가 처리하며 중복 발행도 한 번만 저장한다.")
    void recordAtBeforeCommitWithDuplicateEvents() {
        // Given
        Member leader = member("101");
        RegistrationSubmittedEvent event = event(leader);
        var initial = subscription(leader, "one");
        var active = subscriptions.save(initial.disable(NOW).reconnect(initial.getP256dh(), initial.getAuth(), NOW));

        // When
        transaction().executeWithoutResult(status -> {
            events.publishEvent(event);
            events.publishEvent(event);
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select subscription_generation from notification_deliveries", Long.class)).isEqualTo(active.getGeneration());
        assertThat(jdbc.queryForObject("select expires_at from notification_deliveries", Timestamp.class).toLocalDateTime()).isEqualTo(NOW.plusDays(1));
    }

    @Test
    @DisplayName("트랜잭션 없이 발행하거나 롤백한 사건은 알림과 전송 작업을 남기지 않는다.")
    void ignoreEventOutsideTransactionAndOnRollback() {
        // Given
        RegistrationSubmittedEvent event = event(member("101"));

        // When
        events.publishEvent(event);
        transaction().executeWithoutResult(status -> {
            events.publishEvent(event);
            status.setRollbackOnly();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @Test
    @DisplayName("삭제된 알림 사건을 재처리하거나 구독을 뒤늦게 켜도 알림을 복원하거나 과거 전송을 만들지 않는다.")
    void duplicateDeletedEventDoesNotRestoreOrBackfill() {
        // Given
        Member leader = member("101");
        RegistrationSubmittedEvent event = event(leader);
        transaction().executeWithoutResult(status -> events.publishEvent(event));
        var saved = notifications.findByEventKeyAndMemberId("registration:" + event.registrationId() + ":submitted", leader.getId()).orElseThrow();
        notifications.save(saved.delete(NOW));
        subscription(leader, "late");

        // When
        transaction().executeWithoutResult(status -> events.publishEvent(event));

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select deleted_at from notifications", Timestamp.class)).isNotNull();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isZero();
    }

    @Test
    @DisplayName("같은 사건을 서로 다른 트랜잭션에서 동시에 처리해도 알림과 구독별 전송은 한 번만 생성한다.")
    void concurrentDuplicateEventsCreateOneNotificationAndDelivery() throws Exception {
        // Given
        Member leader = member("101");
        RegistrationSubmittedEvent event = event(leader);
        subscription(leader, "one");
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> publishAfter(start, event));
            var second = executor.submit(() -> publishAfter(start, event));

            // When
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);

            // Then
            assertThat(jdbc.queryForObject("select count(*) from notifications", Integer.class)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Integer.class)).isEqualTo(1);
        }
    }

    private RegistrationSubmittedEvent event(Member leader) {
        GroupRecruitment recruitment = recruitment(leader, JoinMethod.APPROVAL, 3);
        Registration registration = registrations.save(Registration.createPending(recruitment, member("102"), null, NOW));
        return RegistrationSubmittedEvent.from(registration, leader.getId());
    }

    private void publishAfter(CountDownLatch start, RegistrationSubmittedEvent event) {
        try {
            if (!start.await(10, TimeUnit.SECONDS)) {
                throw new AssertionError("동시 사건 발행 신호가 도착하지 않았습니다.");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
        transaction().executeWithoutResult(status -> events.publishEvent(event));
    }

    private TransactionTemplate transaction() {
        return new TransactionTemplate(transactions);
    }
}

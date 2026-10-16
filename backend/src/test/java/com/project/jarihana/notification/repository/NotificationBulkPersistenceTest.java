package com.project.jarihana.notification.repository;

import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationBulkPersistenceTest extends NotificationIntegrationTestSupport {

    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private JsonMapper json;

    @Test
    @DisplayName("벌크 저장은 삭제된 중복을 건너뛰고 새 알림의 모든 필드를 반환한다.")
    void returnOnlyNewNotificationsWithoutRevivingDeletedDuplicates() {
        // Given
        var existing = member("101");
        var recipient = member("102");
        var previous = notifications.save(Notification.create(existing, "group:12:created",
                NotificationEventType.GROUP_CREATED, NotificationPayload.forGroup(12), NOW));
        notifications.save(previous.delete(NOW));

        // When
        List<Notification> inserted = new TransactionTemplate(transactions).execute(status ->
                notifications.insertAllIfAbsentReturning(
                        json.writeValueAsString(List.of(existing.getId(), recipient.getId(), recipient.getId())),
                        "group:12:created", NotificationEventType.GROUP_CREATED.name(), 1,
                        json.writeValueAsString(NotificationPayload.forGroup(12)), NOW));

        // Then
        assertThat(inserted).hasSize(1);
        var notification = inserted.getFirst();
        assertThat(notification.getId()).isPositive();
        assertThat(notification.getMember().getId()).isEqualTo(recipient.getId());
        assertThat(notification.getEventKey()).isEqualTo("group:12:created");
        assertThat(notification.getEventType()).isEqualTo(NotificationEventType.GROUP_CREATED);
        assertThat(notification.getPayloadVersion()).isEqualTo(1);
        assertThat(notification.getPayload()).isEqualTo(NotificationPayload.forGroup(12));
        assertThat(notification.getCreatedAt()).isEqualTo(NOW);
        assertThat(notification.getUpdatedAt()).isEqualTo(NOW);
        assertThat(notification.getReadAt()).isNull();
        assertThat(notification.getDeletedAt()).isNull();
        assertThat(notifications.findByIdAndMemberId(previous.getId(), existing.getId()).orElseThrow().getDeletedAt())
                .isEqualTo(NOW);
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("빈 JSON 입력은 알림과 전송 대기를 저장하지 않는다.")
    void emptyInputsDoNotInsertRows() {
        // Given
        var transaction = new TransactionTemplate(transactions);

        // When
        transaction.executeWithoutResult(status -> {
            assertThat(notifications.insertAllIfAbsentReturning("[]", "group:12:created",
                    NotificationEventType.GROUP_CREATED.name(), 1,
                    json.writeValueAsString(NotificationPayload.forGroup(12)), NOW)).isEmpty();
            assertThat(deliveries.insertAllIfAbsent("[]", NOW, NOW.plusHours(24))).isZero();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
    }

    @Test
    @DisplayName("알림과 전송 대기의 벌크 저장에는 기존 업무 트랜잭션이 필요하다.")
    void bulkInsertsRequireExistingTransaction() {
        // Given
        String payload = json.writeValueAsString(NotificationPayload.forGroup(12));

        // When & Then
        assertThatThrownBy(() -> notifications.insertAllIfAbsentReturning("[]", "group:12:created",
                NotificationEventType.GROUP_CREATED.name(), 1, payload, NOW))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> deliveries.insertAllIfAbsent("[]", NOW, NOW.plusHours(24)))
                .isInstanceOf(IllegalTransactionStateException.class);
    }

    @Test
    @DisplayName("전송 대기 벌크 저장은 최초 구독 세대와 초기 상태를 유지하고 중복을 무시한다.")
    void preserveOriginalGenerationAndPendingStateWhileSkippingDuplicates() {
        // Given
        var owner = member("101");
        var notification = notification(owner, "registration:123:approved");
        var original = subscription(owner, "phone");
        subscriptions.save(original.disable(NOW).reconnect(original.getP256dh(), original.getAuth(), NOW.plusMinutes(1)));
        String targets = json.writeValueAsString(List.of(Map.of("notificationId", notification.getId(),
                "subscriptionId", original.getId(), "generation", original.getGeneration())));

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            assertThat(deliveries.insertAllIfAbsent(targets, NOW, NOW.plusHours(24))).isEqualTo(1);
            assertThat(deliveries.insertAllIfAbsent(targets, NOW, NOW.plusHours(24))).isZero();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isEqualTo(1);
        var row = jdbc.queryForMap("select * from notification_deliveries");
        assertThat(row.get("notification_id")).isEqualTo(notification.getId());
        assertThat(row.get("push_subscription_id")).isEqualTo(original.getId());
        assertThat(row.get("subscription_generation")).isEqualTo(1L);
        assertThat(row.get("status")).isEqualTo("PENDING");
        assertThat(row.get("attempt_count")).isEqualTo(0);
        assertThat(row.get("next_attempt_at")).isEqualTo(Timestamp.valueOf(NOW));
        assertThat(row.get("expires_at")).isEqualTo(Timestamp.valueOf(NOW.plusHours(24)));
        assertThat(row.get("created_at")).isEqualTo(Timestamp.valueOf(NOW));
        assertThat(row.get("updated_at")).isEqualTo(Timestamp.valueOf(NOW));
        assertThat(row.get("lease_token")).isNull();
        assertThat(row.get("locked_until")).isNull();
        assertThat(row.get("accepted_at")).isNull();
        assertThat(row.get("last_error_code")).isNull();
    }
}

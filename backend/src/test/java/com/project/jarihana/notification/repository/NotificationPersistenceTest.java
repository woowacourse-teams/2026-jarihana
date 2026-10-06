package com.project.jarihana.notification.repository;

import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Course;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.command.repository.NotificationCommandRepository;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.query.repository.NotificationQueryRepository;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import com.project.jarihana.support.IntegrationTestSupport;
import com.project.jarihana.support.TestSupportConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NotificationPersistenceTest extends IntegrationTestSupport {

    private static final LocalDateTime NOW = TestSupportConfig.FIXED_NOW;
    private static final String KEY = Base64.getUrlEncoder().withoutPadding().encodeToString(HexFormat.of().parseHex(
            "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"
                    + "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"));
    private static final String AUTH = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    @Autowired
    private MemberRepository members;
    @Autowired
    private NotificationCommandRepository notifications;
    @Autowired
    private NotificationQueryRepository queries;
    @Autowired
    private PushSubscriptionCommandRepository subscriptions;
    @Autowired
    private NotificationDeliveryCommandRepository deliveries;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private PlatformTransactionManager transactions;
    @Autowired
    private JsonMapper jsonMapper;

    @Test
    @DisplayName("알림 payload를 JSONB로 저장하고 상태 전이 후에도 식별자와 생성 시각을 유지한다.")
    void persistJsonPayloadAndImmutableTransitions() {
        // Given
        Member member = member("123");
        Notification saved = notifications.save(notification(member, "registration:3:approved"));

        // When
        Notification read = notifications.save(saved.markRead(NOW.plusMinutes(1)));
        Notification deleted = notifications.save(read.delete(NOW.plusMinutes(2)));
        Notification loaded = notifications.findByEventKeyAndMemberId(saved.getEventKey(), member.getId()).orElseThrow();

        // Then
        assertThat(loaded.getId()).isEqualTo(saved.getId());
        assertThat(loaded.getPayload()).isEqualTo(saved.getPayload());
        assertThat(loaded.getPayloadVersion()).isEqualTo(1);
        assertThat(loaded.getReadAt()).isEqualTo(NOW.plusMinutes(1));
        assertThat(loaded.getDeletedAt()).isEqualTo(NOW.plusMinutes(2));
        assertThat(deleted.getCreatedAt()).isEqualTo(saved.getCreatedAt());
        assertThat(jdbc.queryForObject("select jsonb_typeof(payload) from notifications where id = ?", String.class, saved.getId()))
                .isEqualTo("object");
        assertThat(notifications.findByIdAndMemberId(saved.getId(), member("456").getId())).isEmpty();
    }

    @Test
    @DisplayName("읽음과 삭제는 저장된 payload 버전을 변경하지 않는다.")
    void preserveStoredPayloadVersionDuringStateChanges() {
        // Given
        Member member = member("123");
        Notification saved = notifications.save(notification(member, "registration:3:approved"));
        jdbc.update("update notifications set payload_version = 2 where id = ?", saved.getId());
        Notification loaded = notifications.findByIdAndMemberId(saved.getId(), member.getId()).orElseThrow();

        // When
        Notification read = loaded.markRead(NOW.plusMinutes(1));
        Notification deleted = read.delete(NOW.plusMinutes(2));

        // Then
        assertThat(read.getPayloadVersion()).isEqualTo(2);
        assertThat(deleted.getPayloadVersion()).isEqualTo(2);
    }

    @Test
    @DisplayName("회원과 사건 의미키의 중복은 삭제 후에도 새 행을 만들지 않고 트랜잭션을 계속 사용할 수 있다.")
    void duplicateDeletedEventDoesNotReviveOrAbortTransaction() {
        // Given
        Member member = member("123");
        Notification saved = notifications.save(notification(member, "registration:3:approved"));
        notifications.save(saved.delete(NOW));
        TransactionTemplate transaction = new TransactionTemplate(transactions);

        // When
        transaction.executeWithoutResult(status -> {
            assertThat(insert(member, "registration:3:approved")).isZero();
            assertThat(insert(member, "registration:4:approved")).isEqualTo(1);
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(2);
        assertThat(notifications.findByEventKeyAndMemberId(saved.getEventKey(), member.getId()).orElseThrow().getDeletedAt())
                .isEqualTo(NOW);
        assertThat(queries.countUnread(member.getId())).isEqualTo(1);
        Integer anotherOwnerInsert = new TransactionTemplate(transactions)
                .execute(status -> insert(member("456"), "registration:3:approved"));
        assertThat(anotherOwnerInsert).isEqualTo(1);
    }

    @Test
    @DisplayName("동시에 같은 사건을 기록해도 한 트랜잭션만 알림을 생성한다.")
    void concurrentEventInsertionCreatesOneNotification() throws Exception {
        // Given
        Member member = member("123");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> insertAfterBarrier(member, ready, start));
            var second = executor.submit(() -> insertAfterBarrier(member, ready, start));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            // Then
            assertThat(first.get(10, TimeUnit.SECONDS) + second.get(10, TimeUnit.SECONDS)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(1);
        } finally {
            start.countDown();
        }
    }

    @Test
    @DisplayName("회원별 목록은 읽은 알림을 포함하고 삭제를 제외하며 같은 시각도 ID 커서로 이어진다.")
    void pageByOwnerAndStableCursorWithoutDeletedRows() {
        // Given
        Member member = member("123");
        Notification oldest = notifications.save(notification(member, "registration:1:approved"));
        Notification middle = notifications.save(notification(member, "registration:2:approved"));
        Notification latest = notifications.save(notification(member, "registration:3:approved"));
        Notification deleted = notifications.save(notification(member, "registration:4:approved"));
        notifications.save(latest.markRead(NOW));
        notifications.save(deleted.delete(NOW));
        notifications.save(notification(member("456"), "registration:5:approved"));

        // When
        var first = queries.findPage(member.getId(), null, null, PageRequest.of(0, 2));
        var cursor = first.getContent().getLast();
        var next = queries.findPage(member.getId(), cursor.createdAt(), cursor.id(), PageRequest.of(0, 2));

        // Then
        assertThat(first.getContent().stream().map(item -> item.id())).containsExactly(latest.getId(), middle.getId());
        assertThat(first.hasNext()).isTrue();
        assertThat(first.getContent().getFirst().readAt()).isEqualTo(NOW);
        assertThat(next.getContent().stream().map(item -> item.id())).containsExactly(oldest.getId());
        assertThat(next.hasNext()).isFalse();
        assertThat(queries.countUnread(member.getId())).isEqualTo(2);
    }

    @Test
    @DisplayName("다른 생성 시각에서도 커서 경계 이후의 알림만 조회한다.")
    void pageAcrossDifferentCreationTimes() {
        // Given
        Member member = member("123");
        Notification old = notifications.save(notification(member, "old"));
        Notification recent = notifications.save(notification(member, "recent"));
        jdbc.update("update notifications set created_at = ? where id = ?", NOW.minusHours(1), old.getId());

        // When
        var result = queries.findPage(member.getId(), recent.getCreatedAt(), recent.getId(), PageRequest.of(0, 20));

        // Then
        assertThat(result.getContent().stream().map(item -> item.id())).containsExactly(old.getId());
    }

    @Test
    @DisplayName("2048바이트 endpoint를 저장하고 비활성화해도 다른 회원의 중복 등록을 거절한다.")
    void uniqueEndpointIncludesDisabledSubscriptionsAndMaximumLength() {
        // Given
        Member owner = member("123");
        String prefix = "https://fcm.googleapis.com/";
        String endpoint = prefix + "a".repeat(2048 - prefix.length());
        PushSubscription saved = subscriptions.save(PushSubscription.create(owner, endpoint, KEY, AUTH, NOW));
        subscriptions.save(saved.disable(NOW));

        // When & Then
        assertThat(subscriptions.findByEndpoint(endpoint).orElseThrow().isEnabled()).isFalse();
        assertThatThrownBy(() -> subscriptions.save(PushSubscription.create(member("456"), endpoint, KEY, AUTH, NOW)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(subscriptions.findActiveByMemberId(owner.getId())).isEmpty();
    }

    @Test
    @DisplayName("동시 endpoint 등록은 서로 다른 회원이어도 한 건만 허용한다.")
    void concurrentEndpointInsertionHasSingleOwner() throws Exception {
        // Given
        Member firstOwner = member("123");
        Member secondOwner = member("456");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);

        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> saveSubscriptionAfterBarrier(firstOwner, ready, start));
            var second = executor.submit(() -> saveSubscriptionAfterBarrier(secondOwner, ready, start));
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            // Then
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
            assertThat(jdbc.queryForObject("select count(*) from push_subscriptions", Long.class)).isEqualTo(1);
        } finally {
            start.countDown();
        }
    }

    @Test
    @DisplayName("해제와 재연결을 저장해도 기존 전송의 구독 버전은 바뀌지 않으며 같은 대상은 중복 저장되지 않는다.")
    void deliveryUniquenessAndPersistedGenerationSnapshot() {
        // Given
        Member owner = member("123");
        Notification notification = notifications.save(notification(owner, "registration:3:approved"));
        PushSubscription subscription = subscriptions.save(PushSubscription.create(owner, "https://fcm.googleapis.com/x", KEY, AUTH, NOW));
        NotificationDelivery saved = deliveries.save(NotificationDelivery.create(notification, subscription, NOW, NOW.plusHours(24)));

        // When
        PushSubscription reconnected = subscriptions.save(subscription.disable(NOW).reconnect(KEY, AUTH, NOW.plusMinutes(1)));
        NotificationDelivery next = deliveries.save(NotificationDelivery.create(notification, reconnected, NOW, NOW.plusHours(24)));

        // Then
        assertThat(deliveries.findById(saved.getId()).orElseThrow().getSubscriptionGeneration()).isEqualTo(1);
        assertThat(next.getSubscriptionGeneration()).isEqualTo(3);
        assertThatThrownBy(() -> deliveries.save(NotificationDelivery.create(notification, reconnected, NOW, NOW.plusHours(24))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(subscriptions.findActiveByMemberId(owner.getId()).stream().map(PushSubscription::getId))
                .containsExactly(subscription.getId());
        assertThat(subscriptions.findByIdAndMemberId(subscription.getId(), member("456").getId())).isEmpty();
        assertThat(deliveries.save(saved.cancel()).getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 4, 5})
    @DisplayName("만료된 전송 작업은 시도 횟수를 그대로 유지하며 실패로 종료할 수 있다.")
    void expiredDeliveryCanFailWithoutInventingAttempts(int attemptCount) {
        // Given
        Member owner = member("123");
        Notification notification = notifications.save(notification(owner, "registration:3:approved"));
        PushSubscription subscription = subscriptions.save(
                PushSubscription.create(owner, "https://fcm.googleapis.com/x", KEY, AUTH, NOW));
        NotificationDelivery delivery = deliveries.save(
                NotificationDelivery.create(notification, subscription, NOW, NOW.plusHours(24)));

        // When
        jdbc.update("""
                update notification_deliveries
                set status = 'FAILED', attempt_count = ?, created_at = ?, expires_at = ?, updated_at = ?
                where id = ?
                """, attemptCount, NOW.minusDays(2), NOW.minusHours(1), NOW, delivery.getId());
        NotificationDelivery failed = deliveries.findById(delivery.getId()).orElseThrow();

        // Then
        assertThat(failed.getStatus()).isEqualTo(DeliveryStatus.FAILED);
        assertThat(failed.getAttemptCount()).isEqualTo(attemptCount);
        assertThat(failed.getLeaseToken()).isNull();
        assertThat(failed.getLockedUntil()).isNull();
        assertThat(failed.getAcceptedAt()).isNull();
    }

    @Test
    @DisplayName("트랜잭션이 실패하면 알림과 전송 대기가 함께 롤백된다.")
    void notificationAndDeliveryRollbackTogether() {
        // Given
        Member member = member("123");
        PushSubscription subscription = subscriptions.save(PushSubscription.create(member, "https://fcm.googleapis.com/x", KEY, AUTH, NOW));

        // When
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            Notification notification = notifications.save(notification(member, "registration:3:approved"));
            deliveries.save(NotificationDelivery.create(notification, subscription, NOW, NOW.plusHours(24)));
            status.setRollbackOnly();
        });

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from push_subscriptions", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("공통 truncate 스크립트는 세 테이블을 비우고 식별자를 초기화한다.")
    void truncateIsolatesAllNotificationTables() {
        // Given
        Member member = member("123");
        Notification notification = notifications.save(notification(member, "registration:3:approved"));
        PushSubscription subscription = subscriptions.save(PushSubscription.create(member, "https://fcm.googleapis.com/x", KEY, AUTH, NOW));
        deliveries.save(NotificationDelivery.create(notification, subscription, NOW, NOW.plusHours(24)));

        // When
        for (String table : List.of("notification_deliveries", "push_subscriptions", "notifications")) {
            assertThat(jdbc.queryForObject("select count(*) from " + table, Long.class)).isEqualTo(1);
        }
        new ResourceDatabasePopulator(new ClassPathResource("sql/truncate.sql")).execute(jdbc.getDataSource());

        // Then
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from push_subscriptions", Long.class)).isZero();
        assertThat(notifications.save(notification(member("123"), "registration:4:approved")).getId()).isEqualTo(1);
    }

    private int insert(Member member, String eventKey) {
        return notifications.insertIfAbsent(member.getId(), eventKey, NotificationEventType.REGISTRATION_APPROVED.name(),
                1, jsonMapper.writeValueAsString(NotificationPayload.of(1, 2, 3, null)), NOW);
    }

    private int insertAfterBarrier(Member member, CountDownLatch ready, CountDownLatch start) throws InterruptedException {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("동시 실행 신호를 받지 못했습니다.");
        }
        return new TransactionTemplate(transactions).execute(status -> insert(member, "registration:3:approved"));
    }

    private boolean saveSubscriptionAfterBarrier(Member member, CountDownLatch ready, CountDownLatch start) throws InterruptedException {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("동시 실행 신호를 받지 못했습니다.");
        }
        try {
            subscriptions.save(PushSubscription.create(member, "https://fcm.googleapis.com/concurrent", KEY, AUTH, NOW));
            return true;
        } catch (DataIntegrityViolationException exception) {
            return false;
        }
    }

    private Member member(String githubId) {
        return members.save(Member.create("123".equals(githubId) ? "우주" : "달빛", 8, githubId, Course.BACKEND));
    }

    private Notification notification(Member member, String eventKey) {
        return Notification.create(member, eventKey, NotificationEventType.REGISTRATION_APPROVED,
                NotificationPayload.of(1, 2, 3, null), NOW);
    }
}

package com.project.jarihana.notificationdelivery;

import com.project.jarihana.chat.command.service.ChatCommandService;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.groupmember.domain.GroupMember;
import com.project.jarihana.member.domain.Member;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.domain.NotificationEventType;
import com.project.jarihana.notification.domain.NotificationPayload;
import com.project.jarihana.notification.support.NotificationIntegrationTestSupport;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.PushDeliveryWorkRepository;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.pushsubscription.domain.PushSubscription;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class ChatActivityPushTest extends NotificationIntegrationTestSupport {
    @Autowired private ChatCommandService chats;
    @Autowired private PushDeliveryWorkRepository work;
    @Autowired private PushDeliveryLeaseService leases;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PlatformTransactionManager transactions;

    @Test
    @DisplayName("계정이 활성이면 시도 횟수 없이 보류하고 마지막 보고 15초 후 미읽음을 발송한다.")
    void activeAccountDefersUnreadUntilExactlyFifteenSecondsWithoutSpendingAttempt() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "active");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "안녕하세요");
        active(recipient, NOW);

        // When
        var deferred = claim(NOW).getFirst();

        // Then
        assertThat(deferred.status()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(deferred.attemptCount()).isZero();
        assertThat(deferred.token()).isNull();
        assertThat(claim(NOW.plusSeconds(15).minusNanos(1000))).isEmpty();
        var eligible = claim(NOW.plusSeconds(15)).getFirst();
        assertThat(eligible.status()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        assertThat(eligible.attemptCount()).isEqualTo(1);
        var prepared = new TransactionTemplate(transactions).execute(status -> work.prepare(eligible, NOW.plusSeconds(15)));
        assertThat(prepared).isPresent();
    }

    @Test
    @DisplayName("보류 중 메시지를 읽으면 푸시만 취소하고 알림함 읽음은 바꾸지 않는다.")
    void readWhileDeferredCancelsWithoutReadingTheInbox() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "read");
        var group = room(sender, recipient);
        var message = chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "읽을 메시지").message();
        active(recipient, NOW);
        claim(NOW);
        chats.markRead(recipient.getId(), group.getId(), message.sequence());

        // When & Then
        assertThat(claim(NOW.plusSeconds(15))).singleElement().satisfies(claim -> {
            assertThat(claim.status()).isEqualTo(DeliveryStatus.CANCELLED);
            assertThat(claim.attemptCount()).isZero();
        });
        assertThat(jdbc.queryForObject("select count(*) from notifications where read_at is null", Long.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("선점 후 활성 보고가 오면 전송을 보류하고 예약된 시도 횟수를 돌려준다.")
    void activityBetweenClaimAndPrepareRefundsTheReservedAttempt() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "late-active");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "준비 중 활성");
        // When
        var claimed = claim(NOW).getFirst();
        active(recipient, NOW);

        // Then
        assertThat(leases.prepare(claimed)).isEmpty();
        var stored = deliveries.findById(claimed.id()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(stored.getAttemptCount()).isZero();
        assertThat(stored.getLeaseToken()).isNull();
        assertThat(claim(NOW.plusSeconds(15))).singleElement().satisfies(next ->
                assertThat(next.attemptCount()).isEqualTo(1));
    }

    @Test
    @DisplayName("선점 후 읽은 메시지는 전송 준비 시 취소한다.")
    void readBetweenClaimAndPrepareCancels() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "late-read");
        var group = room(sender, recipient);
        var message = chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "읽음 재확인").message();
        // When
        var claimed = claim(NOW).getFirst();
        chats.markRead(recipient.getId(), group.getId(), message.sequence());

        // Then
        assertThat(leases.prepare(claimed)).isEmpty();
        assertThat(deliveries.findById(claimed.id()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
    }

    @Test
    @DisplayName("방과 기기별 최신 미읽음 하나로 푸시를 묶고 알림함은 모두 보존한다.")
    void newestUnreadMessageRepresentsEachRoomAndDeviceWithoutRemovingInboxRows() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "one");
        capable(recipient, "two");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "첫째");
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "둘째");
        var latest = chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "셋째").message();
        active(recipient, NOW);

        // When
        var deferred = claim(NOW);
        var claimed = claim(NOW.plusSeconds(15));

        // Then
        assertThat(deferred).filteredOn(claim -> claim.status() == DeliveryStatus.PENDING).hasSize(2);

        assertThat(claimed).hasSize(2).allSatisfy(claim ->
                assertThat(claim.status()).isEqualTo(DeliveryStatus.IN_FLIGHT));
        for (var claim : claimed) {
            assertThat(jdbc.queryForObject("select n.event_key from notification_deliveries d join notifications n on n.id = d.notification_id where d.id = ?", String.class, claim.id()))
                    .isEqualTo("chat-message:" + latest.id() + ":created");
        }
        assertThat(jdbc.queryForObject("select count(*) from notifications", Long.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where last_error_code = 'CHAT_COALESCED'", Long.class)).isEqualTo(4);
    }

    @Test
    @DisplayName("활성 계정의 모든 방만 보류하고 다른 계정과 다른 종류 알림은 전송한다.")
    void activeAccountDefersAllItsRoomsButNeitherOtherAccountsNorNonChatPushes() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        var other = member("303");
        var subscription = capable(recipient, "active-other-room");
        capable(other, "inactive-account");
        var first = room(sender, recipient, other);
        var second = room(sender, recipient);
        chats.sendMessage(sender.getId(), first.getId(), UUID.randomUUID(), "첫 방");
        chats.sendMessage(sender.getId(), second.getId(), UUID.randomUUID(), "다른 방");
        deliveries.save(NotificationDelivery.create(notification(recipient, "non-chat"), subscription, NOW, NOW.plusDays(1)));
        active(recipient, NOW);

        // When
        var claimed = claim(NOW);

        // Then
        assertThat(claimed).filteredOn(claim -> claim.status() == DeliveryStatus.PENDING).hasSize(2);
        assertThat(claimed).filteredOn(claim -> claim.status() == DeliveryStatus.IN_FLIGHT).hasSize(2);
    }

    @Test
    @DisplayName("활성 보고가 보류를 연장해도 원래 발송 유효기간이 지나면 종료한다.")
    void repeatedActivityExtendsDeferralAndTheOriginalExpiryStillEndsDelivery() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "expiry");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "만료");
        active(recipient, NOW);
        // When
        var first = claim(NOW).getFirst();
        active(recipient, NOW.plusSeconds(10));
        var second = claim(NOW.plusSeconds(15)).getFirst();
        // Then
        assertThat(second.status()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(second.attemptCount()).isZero();
        jdbc.update("update notification_deliveries set expires_at = ? where id = ?", NOW.plusSeconds(20), first.id());
        active(recipient, NOW.plusSeconds(20));

        assertThat(claim(NOW.plusSeconds(25))).singleElement().satisfies(claim ->
                assertThat(claim.status()).isEqualTo(DeliveryStatus.FAILED));
    }

    @Test
    @DisplayName("서로 다른 DB 세션이 같은 방의 메시지를 중복 선점하지 않는다.")
    void twoDatabaseSessionsCannotClaimDifferentMessagesFromTheSameRoom() throws Exception {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "concurrent");
        var group = room(sender, recipient);
        for (int index = 0; index < 3; index++)
            chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "동시 처리 " + index);
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> new TransactionTemplate(transactions).execute(status -> {
                var result = work.claimNext(NOW, NOW.plusMinutes(1), 1);
                locked.countDown();
                await(release);
                return result;
            }));
            try {
                assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
                // When
                var concurrent = executor.submit(() -> claim(NOW)).get(10, TimeUnit.SECONDS);
                // Then
                assertThat(concurrent).isEmpty();
            } finally {
                release.countDown();
            }
            var firstBatch = first.get(10, TimeUnit.SECONDS);
            var remainder = claim(NOW);
            assertThat(firstBatch).singleElement().satisfies(claim ->
                    assertThat(claim.status()).isEqualTo(DeliveryStatus.CANCELLED));
            assertThat(remainder).filteredOn(claim -> claim.status() == DeliveryStatus.IN_FLIGHT).hasSize(1);
            assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'IN_FLIGHT'", Long.class)).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("새 메시지는 같은 방의 전송을 기다렸다가 다시 발송 대상이 된다.")
    void newMessageWaitsForCurrentRoomSendAndRemainsDeliverableAfterItFinishes() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "new-in-flight");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "전송 중");
        // When
        var inFlight = claim(NOW).getFirst();
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "새 메시지");

        // Then
        assertThat(claim(NOW)).singleElement().satisfies(claim -> {
            assertThat(claim.status()).isEqualTo(DeliveryStatus.PENDING);
            assertThat(claim.attemptCount()).isZero();
        });
        new TransactionTemplate(transactions).executeWithoutResult(status ->
                work.finish(inFlight, DeliveryStatus.ACCEPTED, NOW, null, NOW));
        assertThat(claim(NOW.plusSeconds(1))).singleElement().satisfies(claim ->
                assertThat(claim.status()).isEqualTo(DeliveryStatus.IN_FLIGHT));
    }

    @Test
    @DisplayName("대표 메시지 재시도 중 활성 보류는 실제 시도 횟수와 재시도 상태를 보존한다.")
    void retryDeferralAndPrepareRefundPreserveActualAttemptsAndRetryState() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "retry");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "이전 메시지");
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "대표 메시지");
        var representative = claim(NOW).stream().filter(claim -> claim.status() == DeliveryStatus.IN_FLIGHT).findFirst().orElseThrow();
        new TransactionTemplate(transactions).executeWithoutResult(status ->
                work.finish(representative, DeliveryStatus.RETRY, NOW.plusSeconds(1), "NETWORK_ERROR", NOW));
        active(recipient, NOW);

        // When
        var deferred = claim(NOW.plusSeconds(1)).getFirst();
        // Then
        assertThat(deferred.status()).isEqualTo(DeliveryStatus.RETRY);
        assertThat(deferred.attemptCount()).isEqualTo(1);
        var retry = claim(NOW.plusSeconds(15)).getFirst();
        assertThat(retry.attemptCount()).isEqualTo(2);
        active(recipient, NOW.plusSeconds(15));
        var prepared = new TransactionTemplate(transactions).execute(status -> work.prepare(retry, NOW.plusSeconds(15)));
        assertThat(prepared).isEmpty();
        var stored = deliveries.findById(retry.id()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(DeliveryStatus.RETRY);
        assertThat(stored.getAttemptCount()).isEqualTo(1);
        assertThat(claim(NOW.plusSeconds(30))).singleElement().satisfies(claim ->
                assertThat(claim.attemptCount()).isEqualTo(2));
    }

    @Test
    @DisplayName("만료된 선점의 보류는 이전 시도를 유지하고 오래된 토큰 응답을 무시한다.")
    void expiredLeaseDeferralRetainsThePreviousAttemptAndFencesItsOldToken() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "expired-lease");
        var group = room(sender, recipient);
        chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "lease 만료");
        // When
        var original = claim(NOW).getFirst();
        active(recipient, NOW.plusMinutes(1));
        var deferred = claim(NOW.plusMinutes(1)).getFirst();
        // Then
        assertThat(deferred.status()).isEqualTo(DeliveryStatus.RETRY);
        assertThat(deferred.attemptCount()).isEqualTo(1);
        new TransactionTemplate(transactions).executeWithoutResult(status ->
                assertThat(work.finish(original, DeliveryStatus.ACCEPTED, NOW, null, NOW)).isZero());
        assertThat(claim(NOW.plusSeconds(75))).singleElement().satisfies(claim ->
                assertThat(claim.attemptCount()).isEqualTo(2));
    }

    @Test
    @DisplayName("발송할 수 없는 신규 작업은 이전 미읽음 푸시를 묶음 취소하지 않는다.")
    void unusableNewerDeliveryDoesNotSuppressOlderUnreadMessage() {
        // Given
        var sender = member("301");
        var recipient = member("302");
        capable(recipient, "failed-newer");
        var group = room(sender, recipient);
        var older = chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "이전 미읽음").message();
        var newer = chats.sendMessage(sender.getId(), group.getId(), UUID.randomUUID(), "실패한 신규").message();
        jdbc.update("update notification_deliveries set status = 'FAILED' where notification_id in (select id from notifications where event_key = ?)", "chat-message:" + newer.id() + ":created");

        // When
        var claimed = claim(NOW).getFirst();
        // Then
        assertThat(claimed.status()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        assertThat(jdbc.queryForObject("select n.event_key from notification_deliveries d join notifications n on n.id = d.notification_id where d.id = ?", String.class, claimed.id()))
                .isEqualTo("chat-message:" + older.id() + ":created");
    }

    @Test
    @DisplayName("잘못되거나 없는 원본 식별자는 배치를 중단하지 않고 취소한다.")
    void malformedOrMissingSourceIdentityIsCancelledWithoutBreakingTheBatch() {
        // Given
        var recipient = member("302");
        var subscription = capable(recipient, "legacy");
        for (String key : List.of("legacy-chat", "chat-message:9999999999999999999:created", "chat-message:123456789:created")) {
            var notification = notifications.save(Notification.create(recipient, key, NotificationEventType.CHAT_MESSAGE_RECEIVED,
                    NotificationPayload.forGroup(123), NOW));
            deliveries.save(NotificationDelivery.create(notification, subscription, NOW, NOW.plusDays(1)));
        }
        // When & Then
        assertThat(claim(NOW)).hasSize(3).allSatisfy(claim ->
                assertThat(claim.status()).isEqualTo(DeliveryStatus.CANCELLED));
    }

    @Test
    @DisplayName("구독 ID보다 발송 예정 시각이 이른 작업을 먼저 잠근다.")
    void subscriptionLockSelectionPreservesOldestDueWorkBeforeLowerSubscriptionIds() {
        // Given
        var sender = member("301");
        var newerRecipient = member("302");
        var olderRecipient = member("303");
        capable(newerRecipient, "lower-id");
        var olderSubscription = capable(olderRecipient, "higher-id");
        var newerRoom = room(sender, newerRecipient);
        var olderRoom = room(sender, olderRecipient);
        chats.sendMessage(sender.getId(), newerRoom.getId(), UUID.randomUUID(), "새 대기");
        chats.sendMessage(sender.getId(), olderRoom.getId(), UUID.randomUUID(), "이전 대기");
        jdbc.update("update notification_deliveries set next_attempt_at = ? where push_subscription_id = ?",
                NOW.minusSeconds(1), olderSubscription.getId());

        // When
        var batch = new TransactionTemplate(transactions).execute(status -> work.claimNext(NOW, NOW.plusMinutes(1), 1));
        // Then
        assertThat(batch).singleElement().satisfies(claim ->
                assertThat(jdbc.queryForObject("select push_subscription_id from notification_deliveries where id = ?", Long.class, claim.id()))
                        .isEqualTo(olderSubscription.getId()));
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Timed out waiting for concurrent claim");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }

    private List<DeliveryClaim> claim(LocalDateTime now) {
        return new TransactionTemplate(transactions).execute(status -> work.claimNext(now, now.plusMinutes(1), 20));
    }

    private void active(Member member, LocalDateTime at) {
        jdbc.update("insert into member_activity(member_id, last_active_at) values (?, ?) on conflict (member_id) do update set last_active_at = excluded.last_active_at", member.getId(), at);
    }

    private Group room(Member owner, Member... recipients) {
        var group = groups.save(Group.createClub("활성알림" + owner.getId() + UUID.randomUUID().toString().substring(0, 8), "소개", null, null, null, NOW));
        groupMembers.save(GroupMember.createLeader(group, owner, NOW));
        for (var recipient : recipients) groupMembers.save(GroupMember.createMember(group, recipient, NOW));
        return group;
    }

    private PushSubscription capable(Member owner, String suffix) {
        var subscription = subscription(owner, suffix);
        return subscriptions.save(subscription.reconnect(subscription.getP256dh(), subscription.getAuth(), 3, NOW));
    }
}

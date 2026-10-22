package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notification.command.service.NotificationCommandService;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.command.service.PushSubscriptionCommandService;
import com.project.jarihana.pushsubscription.command.service.dto.RegisterPushSubscriptionCommand;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@Import(PushTransportTestConfig.class)
class PushDeliveryConcurrencyTest extends PushIntegrationTestSupport {
    @Autowired private PushDeliveryWorker worker;
    @Autowired private PushDeliveryLeaseService leases;
    @Autowired private PushTransportStub transport;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private NotificationCommandService inbox;
    @Autowired private PushSubscriptionCommandService bindings;
    @Autowired private PlatformTransactionManager transactions;

    @BeforeEach
    void resetTransport() { transport.reset(); }

    @Test
    void twoWorkersClaimDistinctDeliveries() throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        deliveries.save(NotificationDelivery.create(notification(owner, "second"), subscription, NOW, NOW.plusDays(1)));
        var sent = new CountDownLatch(2);
        var response = new CompletableFuture<PushResult>();
        transport.respondAsync(request -> { sent.countDown(); return response; });
        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(worker::processDue);
            var second = executor.submit(worker::processDue);
            first.get(15, TimeUnit.SECONDS);
            second.get(15, TimeUnit.SECONDS);
            await(sent);
            response.complete(PushResult.accepted());
            awaitDeliveryProcessing();
        }
        // Then
        assertThat(transport.requests()).hasSize(2).extracting(request -> request.deliveryId()).doesNotHaveDuplicates();
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'ACCEPTED' and attempt_count = 1", Long.class)).isEqualTo(2);
    }

    @ParameterizedTest
    @EnumSource(value = DeliveryStatus.class, names = {"PENDING", "RETRY", "IN_FLIGHT"})
    void claimSkipsRowLockedByAnotherTransaction(DeliveryStatus deliveryStatus) throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        var first = deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        var second = deliveries.save(NotificationDelivery.create(notification(owner, "second"), subscription, NOW, NOW.plusDays(1)));
        if (deliveryStatus == DeliveryStatus.RETRY) {
            jdbc.update("update notification_deliveries set status = 'RETRY', attempt_count = 1 where id in (?, ?)",
                    first.getId(), second.getId());
        }
        if (deliveryStatus == DeliveryStatus.IN_FLIGHT) {
            jdbc.update("""
                    update notification_deliveries set status = 'IN_FLIGHT', attempt_count = 1,
                        lease_token = ?, locked_until = ? where id in (?, ?)
                    """, UUID.randomUUID(), NOW.minusSeconds(1), first.getId(), second.getId());
        }
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var holding = executor.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jdbc.queryForObject("select id from notification_deliveries where id = ? for update", Long.class, first.getId());
                locked.countDown();
                await(release);
            }));
            await(locked);
            try {
                // When
                var claim = executor.submit(() -> leases.claimNext()).get(5, TimeUnit.SECONDS).orElseThrow();
                // Then
                assertThat(claim.id()).isEqualTo(second.getId());
            } finally { release.countDown(); }
            holding.get(10, TimeUnit.SECONDS);
        }
    }

    @Test
    void oldGoneResponseCannotDisableSubscriptionAfterLeaseTakeover() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        var old = leases.claimNext().orElseThrow();
        var oldRequest = leases.prepare(old).orElseThrow();
        jdbc.update("update notification_deliveries set locked_until = ? where id = ?", NOW.minusSeconds(1), pending.getId());
        var current = leases.claimNext().orElseThrow();
        var currentRequest = leases.prepare(current).orElseThrow();
        // When
        leases.finish(old, oldRequest, new PushResult(PushResult.Outcome.GONE, "HTTP_410", null));
        // Then
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getLeaseToken()).isEqualTo(current.token());
        assertThat(subscriptions.findByEndpoint(subscription.getEndpoint()).orElseThrow().isEnabled()).isTrue();
        leases.finish(current, currentRequest, PushResult.accepted());
        leases.finish(old, oldRequest, new PushResult(PushResult.Outcome.RETRY, "HTTP_503", null));
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.ACCEPTED);
    }

    @Test
    void delayedAsyncGoneCannotOverwriteRecoveredLease() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "event"), subscription, NOW, NOW.plusDays(1)));
        var responses = new CopyOnWriteArrayList<CompletableFuture<PushResult>>();
        transport.respondAsync(request -> {
            var response = new CompletableFuture<PushResult>();
            responses.add(response);
            return response;
        });
        worker.processDue();
        var oldToken = deliveries.findById(pending.getId()).orElseThrow().getLeaseToken();
        jdbc.update("update notification_deliveries set locked_until = ? where id = ?", NOW.minusSeconds(1), pending.getId());
        // When
        worker.processDue();
        assertThat(responses).hasSize(2);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getLeaseToken()).isNotEqualTo(oldToken);
        responses.get(1).complete(PushResult.accepted());
        org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(5)).untilAsserted(() ->
                assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.ACCEPTED));
        responses.get(0).complete(new PushResult(PushResult.Outcome.GONE, "HTTP_410", null));
        awaitDeliveryProcessing();
        // Then
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.ACCEPTED);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getAttemptCount()).isEqualTo(2);
        assertThat(subscriptions.findByEndpoint(subscription.getEndpoint()).orElseThrow().isEnabled()).isTrue();
    }

    @Test
    void deletionDuringSendPreventsAcknowledgementFromRestoringDelivery() {
        // Given
        var owner = member("101");
        var notification = notification(owner, "first");
        var pending = deliveries.save(NotificationDelivery.create(notification, subscription(owner, "one"), NOW, NOW.plusDays(1)));
        transport.respond(request -> { inbox.deleteNotification(owner.getId(), notification.getId()); return PushResult.accepted(); });
        // When
        worker.processDue();
        // Then
        awaitDeliveryProcessing();
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(transport.requests()).hasSize(1);
    }

    @Test
    void keyReplacementDuringSendIgnoresOldGoneResponse() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        var pending = deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        transport.respond(request -> {
            bindings.registerSubscription(owner.getId(), new RegisterPushSubscriptionCommand(subscription.getEndpoint(),
                    subscription.getP256dh(), "AQAAAAAAAAAAAAAAAAAAAA"));
            return new PushResult(PushResult.Outcome.GONE, "HTTP_410", null);
        });
        // When
        worker.processDue();
        // Then
        awaitDeliveryProcessing();
        var current = subscriptions.findByEndpoint(subscription.getEndpoint()).orElseThrow();
        assertThat(current.isEnabled()).isTrue();
        assertThat(current.getGeneration()).isEqualTo(2);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
    }

    @Test
    void logoutDuringSendCancelsCurrentAndPendingDeliveries() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "one");
        deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        var other = subscription(owner, "other");
        for (int i = 0; i < 3; i++) {
            deliveries.save(NotificationDelivery.create(notification(owner, "blocker" + i), other, NOW, NOW.plusDays(1)));
        }
        deliveries.save(NotificationDelivery.create(notification(owner, "second"), subscription, NOW, NOW.plusDays(1)));
        var response = new CompletableFuture<PushResult>();
        transport.respondAsync(request -> response);
        // When
        worker.processDue();
        assertThat(transport.requests()).hasSize(4);
        assertThat(mutation(owner).contentType("application/json").body(Map.of("pushSubscriptionId", subscription.getId(),
                "generation", 1)).post("/auth/logout").statusCode()).isEqualTo(204);
        response.complete(PushResult.accepted());
        awaitDeliveryProcessing();
        // Then
        assertThat(transport.requests()).hasSize(4);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'CANCELLED'", Long.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'ACCEPTED'", Long.class)).isEqualTo(3);
    }

    private static void await(CountDownLatch latch) {
        try { assertThat(latch.await(10, TimeUnit.SECONDS)).isTrue(); }
        catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new AssertionError(exception); }
    }
}

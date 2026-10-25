package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

@Import(PushTransportTestConfig.class)
@TestPropertySource(properties = "jarihana.push.worker-start-paused=true")
class PushWorkerAdmissionTest extends PushIntegrationTestSupport {

    @Autowired private PushDeliveryWorker worker;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushTransportStub transport;
    @Autowired private WorkerAdmissionController admission;

    @BeforeEach
    void resetTransport() {
        transport.reset();
        admission.pause();
    }

    @Test
    @DisplayName("대기 상태로 시작한 후보 worker는 작업을 선점하거나 푸시를 발송하지 않는다.")
    void pausedCandidateDoesNotClaimOrSend() {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "pending"), subscription(owner, "candidate"), NOW, NOW.plusDays(1)));

        // When
        int processed = worker.processDue();

        // Then
        assertThat(processed).isZero();
        assertThat(transport.requests()).isEmpty();
        var stored = deliveries.findById(pending.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(DeliveryStatus.PENDING);
        assertThat(stored.getAttemptCount()).isZero();
        assertThat(stored.getLeaseToken()).isNull();
        assertThat(stored.getLockedUntil()).isNull();
    }

    @Test
    @DisplayName("대기 후보를 재개하면 재시작 없이 알림을 처리한다.")
    void resumedCandidateProcessesPendingDelivery() {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "resume"), subscription(owner, "candidate"), NOW, NOW.plusDays(1)));

        // When
        admission.resume();
        int processed = worker.processDue();

        // Then
        assertThat(processed).isEqualTo(1);
        awaitDeliveryProcessing();
        assertThat(transport.requests()).hasSize(1);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.ACCEPTED);
    }

    @Test
    @DisplayName("batch 도중 중단하면 승인한 발송만 마치고 다음 작업은 선점하지 않는다.")
    void pauseDuringBatchBlocksNextClaim() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "candidate");
        for (int index = 0; index < 5; index++) {
            deliveries.save(NotificationDelivery.create(notification(owner, "batch-" + index), subscription,
                    NOW, NOW.plusDays(1)));
        }
        admission.resume();
        transport.respond(request -> {
            admission.pause();
            return PushResult.accepted();
        });

        // When
        int processed = worker.processDue();

        // Then
        assertThat(processed).isEqualTo(4);
        Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(admission.drainStatus().inFlight()).isZero());
        assertThat(transport.requests()).hasSize(4);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'ACCEPTED'", Long.class))
                .isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'PENDING' and attempt_count = 0 and lease_token is null", Long.class))
                .isEqualTo(1);
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
    }

    @Test
    @DisplayName("발송 중 중단은 기존 발송을 방해하지 않고 다른 실행의 신규 선점을 차단한다.")
    void pauseWhileSendingBlocksConcurrentWorker() throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "candidate");
        deliveries.save(NotificationDelivery.create(notification(owner, "first"), subscription, NOW, NOW.plusDays(1)));
        deliveries.save(NotificationDelivery.create(notification(owner, "second"), subscription, NOW, NOW.plusDays(1)));
        var response = new CompletableFuture<PushResult>();
        admission.resume();
        transport.respondAsync(request -> response);
        try (var executor = Executors.newSingleThreadExecutor()) {
            // Given: scheduling returns while both transport responses remain outstanding.
            assertThat(executor.submit(worker::processDue).get(5, TimeUnit.SECONDS)).isEqualTo(2);
            try {
                // When
                admission.pause();
                int processed = executor.submit(worker::processDue).get(5, TimeUnit.SECONDS);

                // Then
                assertThat(processed).isZero();
                assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.DRAINING);
                assertThat(admission.drainStatus().inFlight()).isEqualTo(2);
                assertThat(response.isDone()).isFalse();
                assertThat(transport.requests()).hasSize(2);
            } finally {
                response.complete(PushResult.accepted());
            }
        }
        awaitDeliveryProcessing();
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
    }
}

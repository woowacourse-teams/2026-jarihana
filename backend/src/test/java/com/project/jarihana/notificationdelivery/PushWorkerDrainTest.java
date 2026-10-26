package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import com.project.jarihana.notificationdelivery.config.PushDeliveryProperties;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.config.PushProperties;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import io.micrometer.core.instrument.MeterRegistry;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;

@Import(PushTransportTestConfig.class)
class PushWorkerDrainTest extends PushIntegrationTestSupport {
    private enum FailurePhase { CLAIM, PREPARE }
    @MockitoSpyBean private PushDeliveryLeaseService leases;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushTransportStub transport;
    @Autowired private PushProperties properties;
    @Autowired private MeterRegistry metrics;

    private WorkerAdmissionController admission;
    private PushDeliveryWorker worker;

    @BeforeEach
    void setUp() {
        transport.reset();
        // 차단 상태는 지우지 않는다. 각 테스트는 새 프로세스에 해당하는 제어 객체를 사용한다.
        admission = new WorkerAdmissionController(new PushWorkerControlProperties(false));
        worker = new PushDeliveryWorker(leases, transport, properties, PushDeliveryProperties.defaults(), admission, metrics);
    }

    @AfterEach
    void closeWorker() {
        worker.close();
    }

    @Test
    @DisplayName("발송 후 finish 커밋 전에는 중단 완료가 아니고 커밋 후에만 대기로 전환한다.")
    void waitForFinishCommitBeforePaused() throws Exception {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "commit"), subscription(owner, "commit"), NOW, NOW.plusDays(1)));
        var committing = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(invocation -> {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    committing.countDown();
                    await(release);
                }
            });
            return invocation.callRealMethod();
        }).when(leases).finish(any(), any(), any());

        try (var executor = Executors.newSingleThreadExecutor()) {
            var running = executor.submit(worker::processDue);
            try {
                assertThat(committing.await(10, TimeUnit.SECONDS)).isTrue();

                // When
                admission.pause();

                // Then
                assertThat(transport.requests()).hasSize(1);
                assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.DRAINING);
                assertThat(admission.drainStatus().inFlight()).isEqualTo(1);
                assertThat(admission.drainStatus().isDrained()).isFalse();
                assertThat(running.get(5, TimeUnit.SECONDS)).isEqualTo(1);
                assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.IN_FLIGHT);
                assertThatIllegalStateException().isThrownBy(admission::resume);
            } finally {
                release.countDown();
            }
            assertThat(running.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }
        awaitSettled();
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
        assertThat(admission.drainStatus().isDrained()).isTrue();
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.ACCEPTED);
    }

    @Test
    @DisplayName("발송 이후 커밋이 실패하면 결과를 저장한 것으로 간주하지 않고 재개를 차단한다.")
    void failedCommitBlocksResume() {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "rollback"), subscription(owner, "rollback"), NOW, NOW.plusDays(1)));
        doAnswer(invocation -> {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    throw new IllegalStateException("테스트 커밋 실패");
                }
            });
            return invocation.callRealMethod();
        }).when(leases).finish(any(), any(), any());

        // When
        assertThat(worker.processDue()).isEqualTo(1);
        awaitBlocked();
        admission.pause();

        // Then
        assertThat(transport.requests()).hasSize(1);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        assertThatIllegalStateException().isThrownBy(admission::resume);
        assertThat(worker.processDue()).isZero();
        assertThat(admission.drainStatus().unresolved()).isEqualTo(1);
        assertThat(admission.drainStatus().isDrained()).isFalse();
    }

    @Test
    @DisplayName("발송 후 lease가 만료되어 결과 저장이 반영되지 않으면 재개를 차단한다.")
    void lostLeaseAfterSendBlocksResume() {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "expired"), subscription(owner, "expired"), NOW, NOW.plusDays(1)));
        var response = new CompletableFuture<PushResult>();
        transport.respondAsync(request -> response);

        // When
        assertThat(worker.processDue()).isEqualTo(1);
        jdbc.update("update notification_deliveries set locked_until = ? where id = ?",
                NOW.minusSeconds(1), pending.getId());
        response.complete(PushResult.accepted());
        awaitBlocked();
        admission.pause();

        // Then
        assertThat(transport.requests()).hasSize(1);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.IN_FLIGHT);
        assertThatIllegalStateException().isThrownBy(admission::resume);
        assertThat(worker.processDue()).isZero();
        assertThat(admission.drainStatus().unresolved()).isEqualTo(1);
        assertThat(admission.drainStatus().isDrained()).isFalse();
    }

    @ParameterizedTest
    @EnumSource(FailurePhase.class)
    @DisplayName("선점이나 발송 준비가 실패해도 결과 불명확 상태를 유지하고 신규 작업을 막는다.")
    void leaseFailureBlocksFurtherAdmission(FailurePhase phase) {
        // Given
        var owner = member("101");
        deliveries.save(NotificationDelivery.create(
                notification(owner, "failure"), subscription(owner, "failure"), NOW, NOW.plusDays(1)));
        if (phase == FailurePhase.CLAIM) {
            doThrow(new IllegalStateException("테스트 선점 실패")).when(leases).claimNext(anyInt());
        } else {
            doThrow(new IllegalStateException("테스트 준비 실패")).when(leases).prepare(anyList());
        }

        // When
        assertThatIllegalStateException().isThrownBy(worker::processDue);

        // Then
        assertThat(transport.requests()).isEmpty();
        assertThat(admission.drainStatus()).isEqualTo(new WorkerAdmissionController.DrainStatus(
                WorkerAdmissionController.State.BLOCKED, 0, phase == FailurePhase.CLAIM ? 4 : 1));
        admission.pause();
        assertThatIllegalStateException().isThrownBy(admission::resume);
        assertThat(worker.processDue()).isZero();
    }

    @Test
    @DisplayName("선점 직전에 승인된 작업도 진행 중에 포함하고 중단 뒤 해당 작업까지만 완료한다.")
    void admissionBeforeClaimRemainsInFlightDuringPause() throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "before-claim");
        for (int index = 0; index < 5; index++) {
            deliveries.save(NotificationDelivery.create(notification(owner, "claim-" + index), subscription,
                    NOW, NOW.plusDays(1)));
        }
        var claiming = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(invocation -> {
            claiming.countDown();
            await(release);
            return invocation.callRealMethod();
        }).when(leases).claimNext(anyInt());

        try (var executor = Executors.newSingleThreadExecutor()) {
            var running = executor.submit(worker::processDue);
            try {
                assertThat(claiming.await(10, TimeUnit.SECONDS)).isTrue();

                // When
                admission.pause();

                // Then
                assertThat(admission.drainStatus().inFlight()).isEqualTo(4);
                assertThat(admission.drainStatus().isDrained()).isFalse();
                assertThat(transport.requests()).isEmpty();
                assertThat(worker.processDue()).isZero();
            } finally {
                release.countDown();
            }
            assertThat(running.get(10, TimeUnit.SECONDS)).isEqualTo(4);
        }
        awaitSettled();
        assertThat(admission.drainStatus().isDrained()).isTrue();
        assertThat(transport.requests()).hasSize(4);
        assertThat(jdbc.queryForObject("select count(*) from notification_deliveries where status = 'PENDING' and attempt_count = 0", Long.class))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("빈 작업 조회와 발송하지 않은 만료 작업도 허가를 정상 반환한다.")
    void emptyAndExpiredDeliveryReleasePermits() {
        // Given
        assertThat(worker.processDue()).isZero();
        var owner = member("101");
        var expired = deliveries.save(NotificationDelivery.create(
                notification(owner, "terminal"), subscription(owner, "terminal"), NOW, NOW.plusDays(1)));
        jdbc.update("update notification_deliveries set created_at = ?, expires_at = ? where id = ?",
                NOW.minusDays(2), NOW.minusSeconds(1), expired.getId());

        // When
        assertThat(worker.processDue()).isEqualTo(1);
        admission.pause();

        // Then
        awaitSettled();
        assertThat(transport.requests()).isEmpty();
        assertThat(admission.drainStatus().isDrained()).isTrue();
    }

    @Test
    @DisplayName("발송 중 취소가 먼저 확정되면 저장 갱신이 없어도 안전하게 중단 완료할 수 있다.")
    void confirmedCancellationAllowsDrain() {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "cancelled");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "cancelled"), subscription, NOW, NOW.plusDays(1)));
        transport.respond(request -> {
            jdbc.update("update notification_deliveries set status = 'CANCELLED', lease_token = null, locked_until = null where id = ?",
                    request.deliveryId());
            admission.pause();
            return PushResult.accepted();
        });

        // When
        assertThat(worker.processDue()).isEqualTo(1);

        // Then
        awaitSettled();
        assertThat(transport.requests()).hasSize(1);
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus()).isEqualTo(DeliveryStatus.CANCELLED);
        assertThat(admission.drainStatus().isDrained()).isTrue();
    }

    private void awaitSettled() {
        Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(worker.isIdle()).isTrue();
            assertThat(admission.drainStatus().inFlight()).isZero();
        });
    }

    private void awaitBlocked() {
        Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.BLOCKED));
        awaitSettled();
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) { throw new AssertionError("테스트 동기화 대기 시간 초과"); }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }
}

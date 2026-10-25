package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.domain.WorkerAuthority;
import com.project.jarihana.notificationdelivery.command.service.WorkerAuthorityService;
import com.project.jarihana.notificationdelivery.command.service.dto.WorkerControlCommand;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import io.restassured.RestAssured;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@Import(PushTransportTestConfig.class)
@TestPropertySource(properties = {
        "jarihana.push.worker-control-enabled=true",
        "jarihana.push.worker-host-id=A",
        "jarihana.push.worker-environment=http-drain-test",
        "jarihana.worker-control.token=http-drain-test-token-0123456789abcdef"
})
class PushWorkerHttpDrainAcceptanceTest extends PushIntegrationTestSupport {
    @Autowired private PushDeliveryWorker worker;
    @MockitoSpyBean private PushDeliveryLeaseService leases;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushTransportStub transport;
    @Autowired private WorkerAdmissionController admission;
    @Autowired private WorkerIdentity identity;
    @Autowired private WorkerAuthorityService authority;

    @Test
    @DisplayName("worker가 대기하거나 진행 중 작업을 정리하는 동안에도 HTTP 요청을 처리한다.")
    void httpRequestsContinueDuringPausedAndDrainingWorker() throws Exception {
        // Given
        var owner = member("101");
        var pending = deliveries.save(NotificationDelivery.create(
                notification(owner, "http-during-drain"), subscription(owner, "http-during-drain"),
                NOW, NOW.plusDays(1)));

        // When: 새 후보는 시작부터 대기하므로 발송하지 않지만, 앱 HTTP 요청은 처리한다.
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
        assertThat(worker.processDue()).isZero();
        assertThat(transport.requests()).isEmpty();
        assertGroupsRequestSucceedsWithin(Duration.ofSeconds(5));

        // A에 처리 권한을 주고, 발송 결과의 DB commit 직전에 작업을 멈춰 drain 상태를 만든다.
        var active = activate();
        var committing = new CountDownLatch(1);
        var releaseCommit = new CountDownLatch(1);
        doAnswer(invocation -> {
            var result = invocation.callRealMethod();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    committing.countDown();
                    await(releaseCommit);
                }
            });
            return result;
        }).when(leases).finish(any(), any(), any());

        try (var executor = Executors.newFixedThreadPool(2)) {
            var runningWorker = executor.submit(worker::processDue);
            try {
                assertThat(committing.await(10, TimeUnit.SECONDS)).isTrue();
                assertThat(runningWorker.get(5, TimeUnit.SECONDS)).isEqualTo(1);
                var draining = authority.pause(command(active));

                // Then: HTTP는 실제 랜덤 포트에서 응답하고, 기존 작업은 아직 진행 중이어야 한다.
                assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.DRAINING);
                assertThat(admission.drainStatus().inFlight()).isEqualTo(1);
                assertGroupsRequestSucceedsWithin(Duration.ofSeconds(5));
                assertThat(admission.drainStatus().inFlight()).isEqualTo(1);
                assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus())
                        .isEqualTo(DeliveryStatus.IN_FLIGHT);
                assertThat(draining.status()).isEqualTo(WorkerAuthority.Status.DRAINING);
            } finally {
                releaseCommit.countDown();
            }

            assertThat(runningWorker.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }

        awaitDeliveryProcessing();
        assertThat(admission.drainStatus().isDrained()).isTrue();
        assertThat(deliveries.findById(pending.getId()).orElseThrow().getStatus())
                .isEqualTo(DeliveryStatus.ACCEPTED);
        assertThat(transport.requests()).hasSize(1);
    }

    private void assertGroupsRequestSucceedsWithin(Duration timeout) throws Exception {
        try (var executor = Executors.newSingleThreadExecutor()) {
            var response = executor.submit(() -> RestAssured.get("/groups?size=1"))
                    .get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.jsonPath().getBoolean("success")).isTrue();
        }
    }

    private WorkerAuthority activate() {
        var preparing = authority.begin(new WorkerControlCommand(UUID.randomUUID(), 0, UUID.randomUUID(), identity,
                DeploymentPhase.IDLE, NOW.plusMinutes(5), 0));
        var handoff = authority.advance(command(preparing), DeploymentPhase.HANDOFF);
        return authority.activate(command(handoff));
    }

    private WorkerControlCommand command(WorkerAuthority state) {
        return new WorkerControlCommand(state.deploymentId(), state.epoch(), UUID.randomUUID(), identity,
                state.phase(), NOW.plusMinutes(5), state.revision());
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) { throw new AssertionError("worker finish commit 대기 시간 초과"); }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }
}

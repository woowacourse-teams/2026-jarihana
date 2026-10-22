package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.command.repository.NotificationDeliveryCommandRepository;
import com.project.jarihana.notificationdelivery.command.repository.PushDeliveryWorkRepository;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryWorker;
import com.project.jarihana.notificationdelivery.command.service.PushDeliveryLeaseService;
import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import com.project.jarihana.notificationdelivery.control.DeploymentPhase;
import com.project.jarihana.notificationdelivery.control.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.control.WorkerAuthority;
import com.project.jarihana.notificationdelivery.control.WorkerAuthorityRepository;
import com.project.jarihana.notificationdelivery.control.WorkerAuthorityService;
import com.project.jarihana.notificationdelivery.control.WorkerControlCommand;
import com.project.jarihana.notificationdelivery.control.WorkerIdentity;
import com.project.jarihana.notificationdelivery.domain.DeliveryStatus;
import com.project.jarihana.notificationdelivery.domain.NotificationDelivery;
import com.project.jarihana.notificationdelivery.client.dto.PushRequest;
import com.project.jarihana.notificationdelivery.client.dto.PushResult;
import com.project.jarihana.notificationdelivery.command.repository.dto.DeliveryClaim;
import com.project.jarihana.notificationdelivery.support.PushTransportStub;
import com.project.jarihana.notificationdelivery.support.PushTransportTestConfig;
import com.project.jarihana.pushsubscription.command.repository.PushSubscriptionCommandRepository;
import com.project.jarihana.pushsubscription.config.PushProperties;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import java.sql.SQLException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;

@Import(PushTransportTestConfig.class)
@TestPropertySource(properties = {"jarihana.push.worker-control-enabled=true",
        "jarihana.push.worker-host-id=A", "jarihana.push.worker-environment=authority-test",
        "jarihana.worker-control.token=worker-authority-test-token-0123456789abcdef"})
class WorkerAuthorityIntegrationTest extends PushIntegrationTestSupport {
    @Autowired private PushDeliveryWorker worker;
    @Autowired private NotificationDeliveryCommandRepository deliveries;
    @Autowired private PushTransportStub transport;
    @Autowired private WorkerAdmissionController admission;
    @Autowired private WorkerIdentity identity;
    @Autowired private WorkerAuthorityService authority;
    @Autowired private WorkerAuthorityRepository authorityRepository;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private PushDeliveryWorkRepository work;
    @Autowired private PushSubscriptionCommandRepository subscriptions;
    @Autowired private PushProperties pushProperties;
    @Autowired private Clock clock;
    @Autowired private MeterRegistry metrics;
    @MockitoSpyBean private PushDeliveryLeaseService leases;

    @BeforeEach
    void resetWorker() {
        admission.pause();
        transport.reset();
    }

    @Test
    @DisplayName("제어 모드 프로세스는 시작 대기 설정이 없어도 DB 권한 승인 전에는 발송하지 않는다.")
    void controlledProcessStartsPausedWithoutAuthority() {
        // Given
        transport.reset();
        var owner = member("101");
        deliveries.save(NotificationDelivery.create(notification(owner, "candidate"),
                subscription(owner, "candidate"), NOW, NOW.plusDays(1)));

        // When
        int processed = worker.processDue();

        // Then
        assertThat(processed).isZero();
        assertThat(transport.requests()).isEmpty();
    }

    @Test
    @DisplayName("제어 모드의 실제 worker는 명시적 DB 권한 승인 후에만 발송한다.")
    void realWorkerSendsOnlyAfterActivation() {
        // Given
        var owner = member("101");
        deliveries.save(NotificationDelivery.create(notification(owner, "approved"),
                subscription(owner, "approved"), NOW, NOW.plusDays(1)));
        assertThat(leases.claimNext()).isEmpty();

        // When
        activate();
        int processed = worker.processDue();

        // Then
        assertThat(processed).isEqualTo(1);
        assertThat(transport.requests()).hasSize(1);
    }

    @Test
    @DisplayName("로컬 상태가 활성이어도 DB의 owner boot가 다르면 실제 worker는 선점하지 않는다.")
    void databaseOwnerMismatchBlocksActualClaim() {
        // Given
        activate();
        var owner = member("101");
        deliveries.save(NotificationDelivery.create(notification(owner, "fenced"),
                subscription(owner, "fenced"), NOW, NOW.plusDays(1)));
        jdbc.update("update worker_authority set owner_boot_id = ? where environment = ?", UUID.randomUUID(), "authority-test");

        // When
        int processed = worker.processDue();

        // Then
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
        assertThat(processed).isZero();
        assertThat(transport.requests()).isEmpty();
    }

    @Test
    @DisplayName("실제 claim 트랜잭션은 커밋 전까지 권한 행을 잠가 동시 권한 변경을 직렬화한다.")
    void actualClaimHoldsAuthorityLockUntilCommit() throws Exception {
        // Given
        activate();
        var owner = member("101");
        deliveries.save(NotificationDelivery.create(notification(owner, "claim-lock"),
                subscription(owner, "claim-lock"), NOW, NOW.plusDays(1)));
        var committing = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(invocation -> {
            var result = invocation.callRealMethod();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    committing.countDown();
                    try {
                        if (!release.await(10, TimeUnit.SECONDS)) { throw new AssertionError("선점 커밋 대기 시간 초과"); }
                    } catch (InterruptedException exception) {
                        Thread.currentThread().interrupt();
                        throw new AssertionError(exception);
                    }
                }
            });
            return result;
        }).when(leases).claimNext();

        try (var executor = Executors.newSingleThreadExecutor()) {
            var running = executor.submit(worker::processDue);
            try {
                assertThat(committing.await(10, TimeUnit.SECONDS)).isTrue();

                // When / Then
                assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    jdbc.execute("set local lock_timeout = '200ms'");
                    authorityRepository.lock("authority-test");
                })).rootCause().isInstanceOfSatisfying(SQLException.class,
                        exception -> assertThat(exception.getSQLState()).isEqualTo("55P03"));
                assertThat(transport.requests()).isEmpty();
            } finally {
                release.countDown();
            }
            assertThat(running.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }
        assertThat(transport.requests()).hasSize(1);
    }

    @Test
    @DisplayName("A의 푸시 결과를 DB에 기록하기 전에는 B가 발송하지 않고, 완료 후 A와 B가 교대한다.")
    void realWorkersHandoffOnlyAfterFinishCommitAndBack() throws Exception {
        // Given
        var owner = member("101");
        var subscription = subscription(owner, "ab-handoff");
        var first = deliveries.save(NotificationDelivery.create(
                notification(owner, "from-a"), subscription, NOW, NOW.plusDays(1)));
        var second = deliveries.save(NotificationDelivery.create(
                notification(owner, "from-b"), subscription, NOW, NOW.plusDays(1)));
        var activeA = activate();
        var b = workerNode("B");
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
        }).when(leases).finish(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());

        try (var executor = Executors.newSingleThreadExecutor()) {
            var runningA = executor.submit(worker::processDue);
            try {
                assertThat(committing.await(10, TimeUnit.SECONDS)).isTrue();
                assertThat(transport.requests()).hasSize(1);

                // A는 외부 발송을 마쳤지만 finish DB 트랜잭션은 아직 commit되지 않았다.
                var drainingA = authority.pause(command(activeA));
                assertThat(admission.drainStatus().inFlight()).isEqualTo(1);
                assertThatThrownBy(() -> authority.release(command(drainingA)))
                        .isInstanceOf(IllegalStateException.class);
                assertThatThrownBy(() -> b.authority().activate(command(b, drainingA)))
                        .isInstanceOf(IllegalStateException.class);
                assertThat(b.worker().processDue()).isZero();
                assertThat(b.transport().requests()).isEmpty();
                assertThat(deliveries.findById(first.getId()).orElseThrow().getStatus())
                        .isEqualTo(DeliveryStatus.IN_FLIGHT);
            } finally {
                releaseCommit.countDown();
            }

            assertThat(runningA.get(10, TimeUnit.SECONDS)).isEqualTo(1);
        }

        // A의 finish commit과 local drain이 모두 끝나야 DB owner를 넘길 수 있다.
        var drainingA = authorityRepository.find("authority-test").orElseThrow();
        assertThat(admission.drainStatus().isDrained()).isTrue();
        assertThat(deliveries.findById(first.getId()).orElseThrow().getStatus())
                .isEqualTo(DeliveryStatus.ACCEPTED);
        var releasedA = authority.release(command(drainingA));
        var activeB = b.authority().activate(command(b, releasedA));
        assertThat(activeB.owner()).isEqualTo(b.identity());
        assertThat(b.worker().processDue()).isEqualTo(1);
        assertThat(b.transport().requests()).hasSize(1);
        assertThat(deliveries.findById(second.getId()).orElseThrow().getStatus())
                .isEqualTo(DeliveryStatus.ACCEPTED);

        // 다음 작업에서는 B에서 A로 되돌려도 같은 handoff 규칙이 적용된다.
        var third = deliveries.save(NotificationDelivery.create(
                notification(owner, "back-to-a"), subscription, NOW, NOW.plusDays(1)));
        var drainingB = b.authority().pause(command(b, activeB));
        var releasedB = b.authority().release(command(b, drainingB));
        var returnedA = authority.activate(command(releasedB));
        assertThat(returnedA.owner()).isEqualTo(identity);
        assertThat(admission.state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
        assertThat(worker.processDue()).isEqualTo(1);
        assertThat(transport.requests()).hasSize(2);
        assertThat(deliveries.findById(third.getId()).orElseThrow().getStatus())
                .isEqualTo(DeliveryStatus.ACCEPTED);
    }

    private record WorkerNode(WorkerIdentity identity, WorkerAdmissionController admission,
                              WorkerAuthorityService authority, PushDeliveryWorker worker,
                              PushTransportStub transport) { }

    private WorkerNode workerNode(String host) {
        var properties = new PushWorkerControlProperties(false, true, host, "authority-test");
        var nodeIdentity = new WorkerIdentity(host, UUID.randomUUID());
        var nodeAdmission = new WorkerAdmissionController(properties);
        var nodeAuthority = new WorkerAuthorityService(authorityRepository, nodeAdmission, properties,
                nodeIdentity, clock, transactions);
        var nodeTransport = new PushTransportStub();
        var nodeLeases = new TransactionalLeaseService(work, deliveries, subscriptions, pushProperties, clock,
                nodeAuthority, transactions);
        var nodeWorker = new PushDeliveryWorker(nodeLeases, nodeTransport, pushProperties, nodeAdmission, metrics);
        return new WorkerNode(nodeIdentity, nodeAdmission, nodeAuthority, nodeWorker, nodeTransport);
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

    private WorkerControlCommand command(WorkerNode node, WorkerAuthority state) {
        return new WorkerControlCommand(state.deploymentId(), state.epoch(), UUID.randomUUID(), node.identity(),
                state.phase(), NOW.plusMinutes(5), state.revision());
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) { throw new AssertionError("A worker finish commit 대기 시간 초과"); }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError(exception);
        }
    }

    /** 두 번째 독립 worker의 lease 메서드를 각각 실제 Spring 트랜잭션으로 실행한다. */
    private static final class TransactionalLeaseService extends PushDeliveryLeaseService {
        private final TransactionTemplate transactions;

        private TransactionalLeaseService(PushDeliveryWorkRepository work,
                                          NotificationDeliveryCommandRepository deliveries,
                                          PushSubscriptionCommandRepository subscriptions,
                                          PushProperties properties, Clock clock,
                                          WorkerAuthorityService authority,
                                          PlatformTransactionManager transactionManager) {
            super(work, deliveries, subscriptions, properties, clock, authority);
            this.transactions = new TransactionTemplate(transactionManager);
        }

        @Override
        public Optional<DeliveryClaim> claimNext() {
            return transactions.execute(status -> super.claimNext());
        }

        @Override
        public Optional<PushRequest> prepare(DeliveryClaim claim) {
            return transactions.execute(status -> super.prepare(claim));
        }

        @Override
        public boolean finish(DeliveryClaim claim, PushRequest request, PushResult result) {
            return Boolean.TRUE.equals(transactions.execute(status -> super.finish(claim, request, result)));
        }
    }
}

package com.project.jarihana.notificationdelivery;

import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;
import com.project.jarihana.notificationdelivery.domain.WorkerAuthority;
import com.project.jarihana.notificationdelivery.command.repository.WorkerAuthorityRepository;
import com.project.jarihana.notificationdelivery.command.service.WorkerAuthorityService;
import com.project.jarihana.notificationdelivery.command.service.dto.WorkerControlCommand;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;
import com.project.jarihana.pushsubscription.support.PushIntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

class WorkerAuthorityControlTest extends PushIntegrationTestSupport {
    @Autowired private WorkerAuthorityRepository repository;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private Clock clock;

    private record Node(WorkerIdentity identity, WorkerAdmissionController admission, WorkerAuthorityService control) { }

    private Node node(String host) {
        var properties = new PushWorkerControlProperties(false, true, host, "authority-test");
        var admission = new WorkerAdmissionController(properties);
        var identity = new WorkerIdentity(host, UUID.randomUUID());
        return new Node(identity, admission, new WorkerAuthorityService(repository, admission, properties, identity, clock, transactions));
    }

    private WorkerControlCommand command(Node node, WorkerAuthority state) {
        return new WorkerControlCommand(state.deploymentId(), state.epoch(), UUID.randomUUID(), node.identity(),
                state.phase(), NOW.plusMinutes(5), state.revision());
    }

    private WorkerAuthority begin(Node node) {
        return node.control().begin(new WorkerControlCommand(UUID.randomUUID(), 0, UUID.randomUUID(), node.identity(),
                DeploymentPhase.IDLE, NOW.plusMinutes(5), 0));
    }

    private WorkerAuthority activateFirst(Node node) {
        var preparing = begin(node);
        var handoff = node.control().advance(command(node, preparing), DeploymentPhase.HANDOFF);
        return node.control().activate(command(node, handoff));
    }

    private boolean canClaim(Node node) {
        return new TransactionTemplate(transactions).execute(status -> node.control().claimAllowed());
    }

    @Test
    @DisplayName("작업을 끝내고 권한까지 반납한 인계는 다른 worker를 켜지 않고 종료할 수 있다.")
    void releasedHandoffCompletesWithoutActivatingAnotherWorker() {
        // Given
        var a = node("A");
        var active = activateFirst(a);
        var draining = a.control().pause(command(a, active));
        var released = a.control().release(command(a, draining));

        // When
        var complete = a.control().advance(command(a, released), DeploymentPhase.COMPLETE);

        // Then
        assertThat(complete.phase()).isEqualTo(DeploymentPhase.COMPLETE);
        assertThat(complete.status()).isEqualTo(WorkerAuthority.Status.UNASSIGNED);
        assertThat(complete.owner()).isNull();
        assertThat(complete.revision()).isEqualTo(released.revision() + 1);
        assertThat(a.admission().drainStatus().isDrained()).isTrue();
        assertThat(canClaim(a)).isFalse();
    }

    @Test
    @DisplayName("처리 권한이 남아 있거나 반납되지 않은 인계는 완료 단계로 건너뛸 수 없다.")
    void handoffCannotCompleteWhileOwnerIsActiveOrDraining() {
        // Given
        var a = node("A");
        var active = activateFirst(a);

        // When / Then
        assertThatIllegalStateException().isThrownBy(() -> a.control().advance(command(a, active), DeploymentPhase.COMPLETE));
        var draining = a.control().pause(command(a, active));
        assertThatIllegalStateException().isThrownBy(() -> a.control().advance(command(a, draining), DeploymentPhase.COMPLETE));
        assertThat(repository.find("authority-test").orElseThrow()).isEqualTo(draining);
    }

    @Test
    @DisplayName("아무 worker도 활성화하지 않은 인계를 정리하면 다음 시험을 새 세대로 시작할 수 있다.")
    void unassignedHandoffCanCloseAndStartNewDeployment() {
        // Given
        var a = node("A");
        var preparing = begin(a);
        var handoff = a.control().advance(command(a, preparing), DeploymentPhase.HANDOFF);

        // When
        var complete = a.control().advance(command(a, handoff), DeploymentPhase.COMPLETE);
        var next = a.control().begin(new WorkerControlCommand(UUID.randomUUID(), complete.epoch(), UUID.randomUUID(),
                a.identity(), complete.phase(), NOW.plusMinutes(5), complete.revision()));

        // Then
        assertThat(next.epoch()).isEqualTo(complete.epoch() + 1);
        assertThat(next.owner()).isNull();
        assertThat(next.status()).isEqualTo(WorkerAuthority.Status.UNASSIGNED);
        assertThat(canClaim(a)).isFalse();
    }

    @Test
    @DisplayName("결과가 불명확한 작업이 남으면 시험 완료로 건너뛰어 권한을 정리할 수 없다.")
    void unresolvedWorkCannotBeHiddenByCompletion() {
        // Given
        var a = node("A");
        var active = activateFirst(a);
        a.admission().tryAcquire().orElseThrow().close();
        var draining = a.control().pause(command(a, active));

        // When / Then
        assertThatIllegalStateException().isThrownBy(() -> a.control().advance(command(a, draining), DeploymentPhase.COMPLETE));
        assertThat(repository.find("authority-test").orElseThrow()).isEqualTo(draining);
        assertThat(a.admission().drainStatus().unresolved()).isEqualTo(1);
    }

    @Test
    @DisplayName("시험 종료와 새 worker 활성화가 겹쳐도 하나만 적용되고 오래된 명령은 차단된다.")
    void completionAndActivationCannotBothApply() throws Exception {
        // Given
        var a = node("A");
        var b = node("B");
        var active = activateFirst(a);
        var draining = a.control().pause(command(a, active));
        var released = a.control().release(command(a, draining));
        var barrier = new CyclicBarrier(2);

        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var completing = executor.submit(() -> {
                barrier.await(5, TimeUnit.SECONDS);
                try {
                    a.control().advance(command(a, released), DeploymentPhase.COMPLETE);
                    return true;
                } catch (IllegalStateException exception) {
                    return false;
                }
            });
            var activating = executor.submit(() -> activateAtBarrier(b, command(b, released), barrier));
            boolean completed = completing.get(10, TimeUnit.SECONDS);
            boolean activated = activating.get(10, TimeUnit.SECONDS);

            // Then
            assertThat(completed ^ activated).isTrue();
            var row = repository.find("authority-test").orElseThrow();
            assertThat(row.revision()).isEqualTo(released.revision() + 1);
            if (completed) {
                assertThat(row.phase()).isEqualTo(DeploymentPhase.COMPLETE);
                assertThat(row.owner()).isNull();
                assertThat(canClaim(b)).isFalse();
            } else {
                assertThat(row.phase()).isEqualTo(DeploymentPhase.HANDOFF);
                assertThat(row.owner()).isEqualTo(b.identity());
                assertThat(canClaim(b)).isTrue();
            }
        }
    }

    @Test
    @DisplayName("동시 활성화 요청 중 한 프로세스만 DB 권한과 신규 선점을 허용받는다.")
    void concurrentActivationGrantsOnlyOneOwner() throws Exception {
        // Given
        var a = node("A");
        var b = node("B");
        var preparing = begin(a);
        var handoff = a.control().advance(command(a, preparing), DeploymentPhase.HANDOFF);
        var barrier = new CyclicBarrier(2);

        // When
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> activateAtBarrier(a, command(a, handoff), barrier));
            var second = executor.submit(() -> activateAtBarrier(b, command(b, handoff), barrier));
            // Then
            assertThat(first.get(10, TimeUnit.SECONDS) ^ second.get(10, TimeUnit.SECONDS)).isTrue();
        }
        boolean aAllowed = new TransactionTemplate(transactions).execute(status -> a.control().claimAllowed());
        boolean bAllowed = new TransactionTemplate(transactions).execute(status -> b.control().claimAllowed());
        assertThat(aAllowed ^ bAllowed).isTrue();
        assertThat(repository.find("authority-test").orElseThrow().owner()).isIn(a.identity(), b.identity());
    }

    @Test
    @DisplayName("진행 중 작업이 남은 A는 권한을 반납할 수 없고 B도 활성화할 수 없다.")
    void handoffWaitsForAllLocalWork() {
        // Given
        var a = node("A");
        var b = node("B");
        var active = activateFirst(a);
        var permit = a.admission().tryAcquire().orElseThrow();

        // When
        var draining = a.control().pause(command(a, active));

        // Then
        assertThatIllegalStateException().isThrownBy(() -> a.control().release(command(a, draining)));
        assertThatIllegalStateException().isThrownBy(() -> b.control().activate(command(b, draining)));
        assertThat(a.admission().drainStatus().inFlight()).isEqualTo(1);
        assertThat(canClaim(a)).isFalse();
        permit.complete();
        permit.close();
        var released = a.control().release(command(a, draining));
        var activated = b.control().activate(command(b, released));
        assertThat(activated.owner()).isEqualTo(b.identity());
        assertThat(a.admission().state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
        assertThat(b.admission().state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
    }

    @Test
    @DisplayName("재시작한 동일 호스트는 이전 boot 권한을 상속하거나 이전 프로세스 대신 반납할 수 없다.")
    void restartedHostCannotInheritOrReleasePreviousBoot() {
        // Given
        var old = node("A");
        var active = activateFirst(old);
        var restarted = node("A");

        // When / Then
        assertThat(restarted.identity().bootId()).isNotEqualTo(old.identity().bootId());
        assertThat(restarted.admission().state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
        assertThat(canClaim(restarted)).isFalse();
        assertThatIllegalStateException().isThrownBy(() -> restarted.control().pause(command(restarted, active)));
        assertThatIllegalStateException().isThrownBy(() -> restarted.control().activate(command(restarted, active)));
        assertThat(repository.find("authority-test").orElseThrow().owner()).isEqualTo(old.identity());
    }

    @Test
    @DisplayName("결과 불명확한 A는 pause나 재시작 증명으로 권한을 반납할 수 없다.")
    void unresolvedWorkPreventsRelease() {
        // Given
        var a = node("A");
        var active = activateFirst(a);
        a.admission().tryAcquire().orElseThrow().close();

        // When
        var draining = a.control().pause(command(a, active));

        // Then
        assertThatIllegalStateException().isThrownBy(() -> a.control().release(command(a, draining)));
        assertThat(repository.find("authority-test").orElseThrow().owner()).isEqualTo(a.identity());
    }

    @Test
    @DisplayName("이전 활성화 명령을 반복해도 중단 상태를 재개하지 않는다.")
    void activationReplayDoesNotUndoLocalPause() {
        // Given
        var a = node("A");
        var preparing = begin(a);
        var handoff = a.control().advance(command(a, preparing), DeploymentPhase.HANDOFF);
        var activate = command(a, handoff);
        var active = a.control().activate(activate);
        a.admission().pause();

        // When
        var repeated = a.control().activate(activate);

        // Then
        assertThat(repeated).isEqualTo(active);
        assertThat(a.admission().state()).isEqualTo(WorkerAdmissionController.State.PAUSED);
        assertThatIllegalStateException().isThrownBy(a.admission()::resume);
    }

    @Test
    @DisplayName("새 배포 epoch와 phase 변경은 정상 운영 worker의 권한을 만료시키지 않는다.")
    void newDeploymentDoesNotExpireOperatingAuthority() {
        // Given
        var a = node("A");
        var active = activateFirst(a);
        var observing = a.control().advance(command(a, active), DeploymentPhase.OBSERVE);
        var complete = a.control().advance(command(a, observing), DeploymentPhase.COMPLETE);

        // When
        var next = a.control().begin(new WorkerControlCommand(UUID.randomUUID(), complete.epoch(), UUID.randomUUID(),
                a.identity(), complete.phase(), NOW.plusMinutes(5), complete.revision()));

        // Then
        assertThat(next.epoch()).isEqualTo(complete.epoch() + 1);
        assertThat(next.authorityRevision()).isEqualTo(active.authorityRevision());
        assertThat(canClaim(a)).isTrue();
        assertThatIllegalStateException().isThrownBy(() -> a.control().pause(command(a, active)));
    }

    @Test
    @DisplayName("만료·phase·revision·target boot 불일치 명령은 DB와 로컬 상태를 바꾸지 않는다.")
    void staleCommandsHaveNoSideEffects() {
        // Given
        var a = node("A");
        var active = activateFirst(a);
        var valid = command(a, active);
        var expired = new WorkerControlCommand(valid.deploymentId(), valid.epoch(), valid.commandId(), valid.target(),
                valid.expectedPhase(), NOW, valid.expectedRevision());
        var wrongBoot = new WorkerControlCommand(valid.deploymentId(), valid.epoch(), UUID.randomUUID(),
                new WorkerIdentity("A", UUID.randomUUID()), valid.expectedPhase(), valid.deadline(), valid.expectedRevision());
        var wrongPhase = new WorkerControlCommand(valid.deploymentId(), valid.epoch(), UUID.randomUUID(), valid.target(),
                DeploymentPhase.OBSERVE, valid.deadline(), valid.expectedRevision());
        var wrongRevision = new WorkerControlCommand(valid.deploymentId(), valid.epoch(), UUID.randomUUID(), valid.target(),
                valid.expectedPhase(), valid.deadline(), valid.expectedRevision() - 1);

        // When / Then
        for (var stale : new WorkerControlCommand[]{expired, wrongBoot, wrongPhase, wrongRevision}) {
            assertThatIllegalStateException().isThrownBy(() -> a.control().pause(stale));
        }
        assertThat(repository.find("authority-test").orElseThrow()).isEqualTo(active);
        assertThat(a.admission().state()).isEqualTo(WorkerAdmissionController.State.ACTIVE);
    }

    @Test
    @DisplayName("활성화 명령의 deadline이 지난 뒤에도 정상 owner의 신규 선점은 계속 허용한다.")
    void expiredActivationCommandDoesNotExpireAuthority() {
        // Given
        var a = node("A");
        var active = activateFirst(a);
        var later = new WorkerAuthorityService(repository, a.admission(),
                new PushWorkerControlProperties(false, true, "A", "authority-test"), a.identity(),
                Clock.offset(clock, Duration.ofHours(1)), transactions);

        // When
        boolean allowed = new TransactionTemplate(transactions).execute(status -> later.claimAllowed());

        // Then
        assertThat(allowed).isTrue();
        assertThatIllegalStateException().isThrownBy(() -> later.pause(command(a, active)));
        assertThat(repository.find("authority-test").orElseThrow()).isEqualTo(active);
    }

    @Test
    @DisplayName("미완료 배포는 다른 프로세스의 새 begin 명령으로 덮어쓸 수 없다.")
    void unfinishedDeploymentCannotBeTakenOverByNewBegin() {
        // Given
        var a = node("A");
        var b = node("B");
        var preparing = begin(a);
        var next = new WorkerControlCommand(UUID.randomUUID(), preparing.epoch(), UUID.randomUUID(), b.identity(),
                preparing.phase(), NOW.plusMinutes(5), preparing.revision());

        // When / Then
        assertThatIllegalStateException().isThrownBy(() -> b.control().begin(next));
        assertThat(repository.find("authority-test").orElseThrow()).isEqualTo(preparing);
    }

    private boolean activateAtBarrier(Node node, WorkerControlCommand command, CyclicBarrier barrier) throws Exception {
        barrier.await(5, TimeUnit.SECONDS);
        try {
            node.control().activate(command);
            return true;
        } catch (IllegalStateException exception) {
            return false;
        }
    }
}

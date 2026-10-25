package com.project.jarihana.notificationdelivery.command.service;

import com.project.jarihana.notificationdelivery.command.repository.WorkerAuthorityRepository;
import com.project.jarihana.notificationdelivery.command.service.dto.WorkerControlCommand;
import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.domain.WorkerAuthority;
import com.project.jarihana.notificationdelivery.domain.WorkerAuthority.Status;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Objects;

@Service
public class WorkerAuthorityService {
    private enum Action { BEGIN, ADVANCE, ACTIVATE, PAUSE, RELEASE }
    private record Applied(WorkerAuthority authority, boolean duplicate) { }

    private final WorkerAuthorityRepository repository;
    private final WorkerAdmissionController admission;
    private final PushWorkerControlProperties properties;
    private final WorkerIdentity identity;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public WorkerAuthorityService(WorkerAuthorityRepository repository, WorkerAdmissionController admission,
                                  PushWorkerControlProperties properties, WorkerIdentity identity, Clock clock,
                                  PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.admission = admission;
        this.properties = properties;
        this.identity = identity;
        this.clock = clock;
        transactions = new TransactionTemplate(transactionManager);
        // 로컬 활성화가 DB 커밋보다 먼저 일어나지 않도록 독립 트랜잭션을 사용한다.
        transactions.setPropagationBehaviorName("PROPAGATION_REQUIRES_NEW");
    }

    public synchronized WorkerAuthority begin(WorkerControlCommand command) {
        return apply(command, Action.BEGIN, DeploymentPhase.PREPARE);
    }

    public synchronized WorkerAuthority advance(WorkerControlCommand command, DeploymentPhase nextPhase) {
        return apply(command, Action.ADVANCE, Objects.requireNonNull(nextPhase));
    }

    public synchronized WorkerAuthority activate(WorkerControlCommand command) {
        return apply(command, Action.ACTIVATE, null);
    }

    public synchronized WorkerAuthority pause(WorkerControlCommand command) {
        return apply(command, Action.PAUSE, null);
    }

    public synchronized WorkerAuthority release(WorkerControlCommand command) {
        return apply(command, Action.RELEASE, null);
    }

    /** 호출한 claim 트랜잭션에서 권한 행을 잠그고 선점 커밋까지 유지한다. */
    public boolean claimAllowed() {
        if (!properties.workerControlEnabled()) { return true; }
        return repository.lock(properties.workerEnvironment())
                .filter(row -> identity.equals(row.owner()) && row.status() == Status.ACTIVE)
                .filter(row -> admission.state() == WorkerAdmissionController.State.ACTIVE)
                .isPresent();
    }

    private WorkerAuthority apply(WorkerControlCommand command, Action action, DeploymentPhase nextPhase) {
        if (!properties.workerControlEnabled()) { throw new IllegalStateException("worker 제어 모드가 아닙니다."); }
        String payload = action + "|" + nextPhase + "|" + command;
        Applied applied = Objects.requireNonNull(transactions.execute(transaction -> {
            repository.initialize(properties.workerEnvironment());
            var row = repository.lock(properties.workerEnvironment()).orElseThrow();
            // 잠금 대기로 deadline이 지났을 수 있으므로 잠금 획득 후 다시 판정한다.
            if (!identity.equals(command.target()) || !LocalDateTime.now(clock).isBefore(command.deadline())) {
                throw new IllegalStateException("명령의 대상 프로세스 또는 유효기간이 일치하지 않습니다.");
            }
            if (command.commandId().equals(row.lastCommandId())) {
                if (!payload.equals(row.lastCommandPayload())) { throw new IllegalStateException("같은 명령 ID의 내용이 다릅니다."); }
                return new Applied(row, true);
            }
            if (row.epoch() != command.epoch() || row.phase() != command.expectedPhase()
                    || row.revision() != command.expectedRevision()
                    || (action != Action.BEGIN && !Objects.equals(row.deploymentId(), command.deploymentId()))) {
                throw new IllegalStateException("현재 배포 세대·단계·버전과 명령이 일치하지 않습니다.");
            }
            var changed = change(row, command, action, nextPhase, payload);
            repository.save(changed);
            return new Applied(changed, false);
        }));
        if (action == Action.ACTIVATE && !applied.duplicate()) { admission.resumeAuthorized(); }
        return applied.authority();
    }

    private WorkerAuthority change(WorkerAuthority row, WorkerControlCommand command, Action action,
                                    DeploymentPhase nextPhase, String payload) {
        var deployment = row.deploymentId();
        long epoch = row.epoch();
        var phase = row.phase();
        long authorityRevision = row.authorityRevision();
        var owner = row.owner();
        var status = row.status();
        switch (action) {
            case BEGIN -> {
                if ((phase != DeploymentPhase.IDLE && phase != DeploymentPhase.COMPLETE) || status == Status.DRAINING) {
                    throw new IllegalStateException("미완료 배포가 있어 새 배포를 시작할 수 없습니다.");
                }
                deployment = command.deploymentId();
                epoch++;
                phase = DeploymentPhase.PREPARE;
            }
            case ADVANCE -> {
                boolean releasedCompletion = phase == DeploymentPhase.HANDOFF && nextPhase == DeploymentPhase.COMPLETE
                        && status == Status.UNASSIGNED && owner == null && admission.drainStatus().isDrained();
                if ((!canAdvance(phase, nextPhase) && !releasedCompletion)
                        || (nextPhase == DeploymentPhase.OBSERVE && status != Status.ACTIVE)) {
                    throw new IllegalStateException("허용되지 않은 배포 단계 전환입니다.");
                }
                phase = nextPhase;
            }
            case ACTIVATE -> {
                requireHandoff(phase);
                if (status != Status.UNASSIGNED || !admission.drainStatus().isDrained()) {
                    throw new IllegalStateException("이전 처리 권한 반납 또는 현재 프로세스의 대기를 확인하지 못했습니다.");
                }
                owner = identity;
                status = Status.ACTIVE;
                authorityRevision++;
            }
            case PAUSE -> {
                requireHandoff(phase);
                requireOwner(owner);
                admission.pause();
                status = Status.DRAINING;
                authorityRevision++;
            }
            case RELEASE -> {
                requireHandoff(phase);
                requireOwner(owner);
                if (status != Status.DRAINING || !admission.drainStatus().isDrained()) {
                    throw new IllegalStateException("해당 프로세스의 작업 종료를 확인하지 못했습니다.");
                }
                owner = null;
                status = Status.UNASSIGNED;
                authorityRevision++;
            }
        }
        return new WorkerAuthority(row.environment(), deployment, epoch, phase, row.revision() + 1,
                authorityRevision, owner, status, command.commandId(), payload);
    }

    private void requireOwner(WorkerIdentity owner) {
        if (!identity.equals(owner)) { throw new IllegalStateException("현재 프로세스가 처리 권한의 소유자가 아닙니다."); }
    }

    private void requireHandoff(DeploymentPhase phase) {
        if (phase != DeploymentPhase.HANDOFF) { throw new IllegalStateException("worker 인계 단계가 아닙니다."); }
    }

    private boolean canAdvance(DeploymentPhase phase, DeploymentPhase next) {
        return switch (phase) {
            case PREPARE -> next == DeploymentPhase.HANDOFF || next == DeploymentPhase.COMPLETE || next == DeploymentPhase.NEEDS_ATTENTION;
            case HANDOFF -> next == DeploymentPhase.OBSERVE || next == DeploymentPhase.NEEDS_ATTENTION;
            case OBSERVE -> next == DeploymentPhase.COMPLETE || next == DeploymentPhase.HANDOFF || next == DeploymentPhase.NEEDS_ATTENTION;
            case NEEDS_ATTENTION -> next == DeploymentPhase.HANDOFF;
            case IDLE, COMPLETE -> false;
        };
    }
}

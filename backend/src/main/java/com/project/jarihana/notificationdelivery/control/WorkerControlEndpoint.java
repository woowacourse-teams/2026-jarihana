package com.project.jarihana.notificationdelivery.control;

import com.project.jarihana.notificationdelivery.config.PushWorkerControlProperties;
import com.project.jarihana.notificationdelivery.config.WorkerControlApiProperties;
import org.jspecify.annotations.Nullable;
import org.springframework.boot.actuate.endpoint.annotation.ReadOperation;
import org.springframework.boot.actuate.endpoint.annotation.Selector;
import org.springframework.boot.actuate.endpoint.annotation.WriteOperation;
import org.springframework.boot.actuate.endpoint.web.WebEndpointResponse;
import org.springframework.boot.actuate.endpoint.web.annotation.WebEndpoint;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.UUID;

@Component
@WebEndpoint(id = "workercontrol")
@ConditionalOnProperty(prefix = "jarihana.push", name = "worker-control-enabled", havingValue = "true")
public class WorkerControlEndpoint {

    private static final Logger log = LoggerFactory.getLogger(WorkerControlEndpoint.class);

    private final WorkerAuthorityService authorityService;
    private final WorkerAuthorityRepository authorityRepository;
    private final WorkerAdmissionController admission;
    private final PushWorkerControlProperties workerProperties;
    private final WorkerControlApiProperties apiProperties;
    private final WorkerIdentity identity;

    public WorkerControlEndpoint(WorkerAuthorityService authorityService,
                                 WorkerAuthorityRepository authorityRepository,
                                 WorkerAdmissionController admission,
                                 PushWorkerControlProperties workerProperties,
                                 WorkerControlApiProperties apiProperties,
                                 WorkerIdentity identity) {
        if (apiProperties.token().getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalArgumentException("worker 제어 API를 사용하려면 32바이트 이상의 머신 토큰이 필요합니다.");
        }
        this.authorityService = authorityService;
        this.authorityRepository = authorityRepository;
        this.admission = admission;
        this.workerProperties = workerProperties;
        this.apiProperties = apiProperties;
        this.identity = identity;
    }

    @ReadOperation
    public StatusResponse status() {
        var local = admission.drainStatus();
        var authority = authorityRepository.find(workerProperties.workerEnvironment())
                .map(AuthorityResponse::from)
                .orElse(null);
        return new StatusResponse(apiProperties.version(), workerProperties.workerEnvironment(), identity,
                new LocalWorkerState(local.state(), local.inFlight(), local.unresolved()), authority);
    }

    @WriteOperation
    public WebEndpointResponse<CommandResponse> execute(
            @Selector String operation,
            UUID deploymentId,
            long epoch,
            UUID commandId,
            String targetHostId,
            UUID targetBootId,
            DeploymentPhase expectedPhase,
            LocalDateTime deadline,
            long expectedRevision,
            @Nullable DeploymentPhase nextPhase
    ) {
        try {
            WorkerControlCommand command = new WorkerControlCommand(deploymentId, epoch, commandId,
                    new WorkerIdentity(targetHostId, targetBootId), expectedPhase, deadline, expectedRevision);
            WorkerAuthority authority = switch (operation) {
                case "begin" -> authorityService.begin(command);
                case "phase" -> authorityService.advance(command, requireNextPhase(nextPhase));
                case "pause" -> authorityService.pause(command);
                case "activate" -> authorityService.activate(command);
                case "release" -> authorityService.release(command);
                default -> null;
            };
            if (authority == null) {
                logCommand(operation, deploymentId, epoch, commandId, "rejected", "invalid_operation");
                return new WebEndpointResponse<>(
                        new CommandResponse(false, "INVALID_OPERATION", "허용되지 않은 worker 제어 명령입니다.", null),
                        HttpStatus.BAD_REQUEST.value());
            }
            logCommand(operation, deploymentId, epoch, commandId, "accepted", authority.phase().name());
            return new WebEndpointResponse<>(
                    new CommandResponse(true, null, null, AuthorityResponse.from(authority)), HttpStatus.OK.value());
        } catch (IllegalStateException exception) {
            logCommand(operation, deploymentId, epoch, commandId, "rejected", "state_conflict");
            return new WebEndpointResponse<>(
                    new CommandResponse(false, "WORKER_CONTROL_CONFLICT",
                            "현재 worker 상태와 명령이 일치하지 않습니다.", null), HttpStatus.CONFLICT.value());
        } catch (IllegalArgumentException exception) {
            logCommand(operation, deploymentId, epoch, commandId, "rejected", "invalid_command");
            return new WebEndpointResponse<>(
                    new CommandResponse(false, "INVALID_WORKER_COMMAND",
                            "worker 제어 명령이 올바르지 않습니다.", null), HttpStatus.BAD_REQUEST.value());
        }
    }

    private DeploymentPhase requireNextPhase(DeploymentPhase nextPhase) {
        if (nextPhase == null) {
            throw new IllegalArgumentException("다음 배포 단계가 필요합니다.");
        }
        return nextPhase;
    }

    private void logCommand(String operation, UUID deploymentId, long epoch, UUID commandId,
                            String outcome, String result) {
        log.atInfo()
                .addKeyValue("event.action", "worker.control.command")
                .addKeyValue("worker.operation", operation)
                .addKeyValue("worker.deployment_id", deploymentId)
                .addKeyValue("worker.epoch", epoch)
                .addKeyValue("worker.command_id", commandId)
                .addKeyValue("worker.outcome", outcome)
                .addKeyValue("worker.result", result)
                .log("Worker control command processed");
    }

    public record StatusResponse(String version, String environment, WorkerIdentity identity,
                                 LocalWorkerState worker, AuthorityResponse authority) { }

    public record LocalWorkerState(WorkerAdmissionController.State state, int inFlight, int unresolved) { }

    public record AuthorityResponse(String environment, UUID deploymentId, long epoch, DeploymentPhase phase,
                                    long revision, long authorityRevision, WorkerIdentity owner,
                                    WorkerAuthority.Status status) {
        private static AuthorityResponse from(WorkerAuthority authority) {
            return new AuthorityResponse(authority.environment(), authority.deploymentId(), authority.epoch(),
                    authority.phase(), authority.revision(), authority.authorityRevision(), authority.owner(),
                    authority.status());
        }
    }

    public record CommandResponse(boolean success, String code, String message, AuthorityResponse authority) { }
}

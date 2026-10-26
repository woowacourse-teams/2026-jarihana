package com.project.jarihana.notificationdelivery.command.service.dto;

import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

public record WorkerControlCommand(UUID deploymentId, long epoch, UUID commandId,
                                   WorkerIdentity target, DeploymentPhase expectedPhase,
                                   LocalDateTime deadline, long expectedRevision) {
    public WorkerControlCommand {
        Objects.requireNonNull(deploymentId);
        Objects.requireNonNull(commandId);
        Objects.requireNonNull(target);
        Objects.requireNonNull(expectedPhase);
        Objects.requireNonNull(deadline);
        if (epoch < 0 || expectedRevision < 0) { throw new IllegalArgumentException("음수 제어 버전은 허용하지 않습니다."); }
    }
}

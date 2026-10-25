package com.project.jarihana.notificationdelivery.domain;

import java.util.UUID;

public record WorkerAuthority(String environment, UUID deploymentId, long epoch, DeploymentPhase phase,
                              long revision, long authorityRevision, WorkerIdentity owner, Status status,
                              UUID lastCommandId, String lastCommandPayload) {
    public enum Status { UNASSIGNED, ACTIVE, DRAINING }
}

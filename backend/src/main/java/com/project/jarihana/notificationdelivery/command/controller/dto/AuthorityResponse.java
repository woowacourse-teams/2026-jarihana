package com.project.jarihana.notificationdelivery.command.controller.dto;

import com.project.jarihana.notificationdelivery.domain.DeploymentPhase;
import com.project.jarihana.notificationdelivery.domain.WorkerAuthority;
import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;

import java.util.UUID;

public record AuthorityResponse(String environment, UUID deploymentId, long epoch, DeploymentPhase phase,
                                long revision, long authorityRevision, WorkerIdentity owner,
                                WorkerAuthority.Status status) {
    public static AuthorityResponse from(WorkerAuthority authority) {
        return new AuthorityResponse(authority.environment(), authority.deploymentId(), authority.epoch(),
                authority.phase(), authority.revision(), authority.authorityRevision(), authority.owner(),
                authority.status());
    }
}

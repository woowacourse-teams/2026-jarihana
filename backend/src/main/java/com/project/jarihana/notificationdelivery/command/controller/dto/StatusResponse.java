package com.project.jarihana.notificationdelivery.command.controller.dto;

import com.project.jarihana.notificationdelivery.domain.WorkerIdentity;

public record StatusResponse(String version, String environment, WorkerIdentity identity,
                             WorkerStateResponse worker, AuthorityResponse authority, ActivityResponse activity) { }

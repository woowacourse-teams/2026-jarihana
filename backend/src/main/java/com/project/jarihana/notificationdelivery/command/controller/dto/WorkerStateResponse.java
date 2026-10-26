package com.project.jarihana.notificationdelivery.command.controller.dto;

import com.project.jarihana.notificationdelivery.command.service.WorkerAdmissionController;

public record WorkerStateResponse(WorkerAdmissionController.State state, int inFlight, int unresolved) { }

package com.project.jarihana.gomoku.command.service.dto;

import com.project.jarihana.gomoku.domain.GomokuObservation;

public record GomokuObservationResult(GomokuObservation observation, boolean created) {}

package com.project.jarihana.gomoku.command.controller.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record GomokuObservationRequest(@NotNull UUID requestId) {}

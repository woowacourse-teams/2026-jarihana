package com.project.jarihana.gomoku.command.controller.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record GomokuReadyRequest(@NotNull Boolean ready, @Min(1) int gameNumber) {}

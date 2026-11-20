package com.project.jarihana.gomoku.command.controller.dto;

import com.project.jarihana.gomoku.command.service.dto.GomokuMoveCommand;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record GomokuMoveRequest(
        @Min(1) int gameNumber,
        @Min(0) @Max(224) int expectedPly,
        @NotNull @Min(0) @Max(14) Integer x,
        @NotNull @Min(0) @Max(14) Integer y,
        @NotNull UUID requestId) {
    public GomokuMoveCommand toCommand() {
        return new GomokuMoveCommand(gameNumber, expectedPly, x, y, requestId);
    }
}

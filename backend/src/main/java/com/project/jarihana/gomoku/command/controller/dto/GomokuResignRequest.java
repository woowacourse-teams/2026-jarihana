package com.project.jarihana.gomoku.command.controller.dto;

import jakarta.validation.constraints.Min;

public record GomokuResignRequest(@Min(1) int gameNumber) {}

package com.project.jarihana.gomoku.command.controller.dto;

import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomVisibility;

import jakarta.validation.constraints.NotNull;

public record GomokuCreateRequest(@NotNull RoomVisibility visibility, @NotNull GomokuRule rule) {}

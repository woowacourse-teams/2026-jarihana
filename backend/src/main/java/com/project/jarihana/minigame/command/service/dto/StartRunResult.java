package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.StickPuzzle;

public record StartRunResult(long runId, int round, StickPuzzle stick) {
}

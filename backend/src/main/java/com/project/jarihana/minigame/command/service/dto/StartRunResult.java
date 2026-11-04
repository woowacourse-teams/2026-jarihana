package com.project.jarihana.minigame.command.service.dto;

import com.project.jarihana.minigame.domain.StickPuzzle;
import java.time.LocalDateTime;

public record StartRunResult(long runId, int round, StickPuzzle stick, int remainingAttempts, LocalDateTime attemptsRefillAt) {
}

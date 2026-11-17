package com.project.jarihana.rhythmbattle.command.controller.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.domain.BattleVisibility;

import jakarta.validation.constraints.NotNull;

public record RhythmBattleCreateRequest(@NotNull BattleVisibility visibility, @NotNull RhythmLevel level) {
}

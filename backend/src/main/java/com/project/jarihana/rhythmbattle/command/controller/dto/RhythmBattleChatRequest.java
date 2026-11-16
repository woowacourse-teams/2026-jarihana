package com.project.jarihana.rhythmbattle.command.controller.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record RhythmBattleChatRequest(@NotNull UUID clientMessageId, @NotNull String body) {
}

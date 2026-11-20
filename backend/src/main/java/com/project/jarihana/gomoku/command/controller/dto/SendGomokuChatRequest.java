package com.project.jarihana.gomoku.command.controller.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record SendGomokuChatRequest(@NotNull UUID participationId, @NotNull UUID clientMessageId,
        @NotBlank @Size(max = 2000) String content) {}

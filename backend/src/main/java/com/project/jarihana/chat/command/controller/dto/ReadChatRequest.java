package com.project.jarihana.chat.command.controller.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record ReadChatRequest(
        @NotNull @Pattern(regexp = "0|[1-9][0-9]{0,18}") String lastReadSequence) {}

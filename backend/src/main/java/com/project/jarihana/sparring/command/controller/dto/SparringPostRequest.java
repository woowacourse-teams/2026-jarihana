package com.project.jarihana.sparring.command.controller.dto;

import com.project.jarihana.sparring.command.service.dto.PostSparringCommand;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record SparringPostRequest(
        @NotBlank @Size(max = 160) String text,
        @Positive Long replyToId,
        @NotNull java.util.UUID requestId) {
    public PostSparringCommand toCommand() {
        return new PostSparringCommand(text, replyToId, requestId);
    }
}

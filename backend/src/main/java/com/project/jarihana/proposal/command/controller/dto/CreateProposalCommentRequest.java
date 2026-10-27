package com.project.jarihana.proposal.command.controller.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateProposalCommentRequest(@NotBlank String content) {
}

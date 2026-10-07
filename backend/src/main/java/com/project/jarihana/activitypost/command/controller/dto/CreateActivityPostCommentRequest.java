package com.project.jarihana.activitypost.command.controller.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateActivityPostCommentRequest(@NotBlank String content) {
}

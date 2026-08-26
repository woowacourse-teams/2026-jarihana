package com.project.jarihana.image.command.controller.dto;

import com.project.jarihana.image.command.service.dto.CreateImageUploadResult;
import java.time.LocalDateTime;
import java.util.UUID;

public record CreateImageUploadResponse(
        UUID id,
        String imageKey,
        String uploadUrl,
        LocalDateTime expiresAt
) {

    public static CreateImageUploadResponse from(CreateImageUploadResult result) {
        return new CreateImageUploadResponse(result.id(), result.imageKey(), result.uploadUrl(), result.expiresAt());
    }
}

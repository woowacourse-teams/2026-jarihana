package com.project.jarihana.image.command.service.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record CreateImageUploadResult(
        UUID id,
        String imageKey,
        String uploadUrl,
        LocalDateTime expiresAt
) {
}

package com.project.jarihana.image.command.service.dto;

public record CreateImageUploadCommand(
        String fileName,
        String contentType,
        long fileSize
) {
}

package com.project.jarihana.image.command.controller.dto;

import com.project.jarihana.image.command.service.dto.CreateImageUploadCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public record CreateImageUploadRequest(
        @NotBlank String fileName,
        @NotBlank String contentType,
        @Positive long fileSize
) {

    public CreateImageUploadCommand toCommand() {
        return new CreateImageUploadCommand(fileName, contentType, fileSize);
    }
}

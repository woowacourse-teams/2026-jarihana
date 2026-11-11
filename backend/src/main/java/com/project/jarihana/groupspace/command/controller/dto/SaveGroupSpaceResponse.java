package com.project.jarihana.groupspace.command.controller.dto;

import com.project.jarihana.groupspace.command.service.dto.SaveGroupSpaceResult;
import java.time.LocalDateTime;
import tools.jackson.databind.JsonNode;

public record SaveGroupSpaceResponse(JsonNode room, long revision, boolean canEdit, LocalDateTime updatedAt) {
    public static SaveGroupSpaceResponse from(SaveGroupSpaceResult result) {
        return new SaveGroupSpaceResponse(result.room(), result.revision(), result.canEdit(), result.updatedAt());
    }
}

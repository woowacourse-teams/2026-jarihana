package com.project.jarihana.groupspace.query.controller.dto;

import com.project.jarihana.groupspace.query.service.dto.GroupSpaceResult;
import java.time.LocalDateTime;
import tools.jackson.databind.JsonNode;

public record GroupSpaceResponse(JsonNode room, long revision, boolean canEdit, LocalDateTime updatedAt) {
    public static GroupSpaceResponse from(GroupSpaceResult result) {
        return new GroupSpaceResponse(result.room(), result.revision(), result.canEdit(), result.updatedAt());
    }
}

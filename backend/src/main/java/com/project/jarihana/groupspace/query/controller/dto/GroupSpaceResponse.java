package com.project.jarihana.groupspace.query.controller.dto;

import com.project.jarihana.groupspace.query.service.dto.GroupSpaceResult;
import com.project.jarihana.groupspace.domain.BlueprintRef;
import java.time.LocalDateTime;
import tools.jackson.databind.JsonNode;

public record GroupSpaceResponse(JsonNode room, long revision, boolean canEdit, LocalDateTime updatedAt,
                                BlueprintRef blueprintRef, JsonNode geometry, JsonNode spawn, JsonNode defaultRoom) {
    public static GroupSpaceResponse from(GroupSpaceResult result) {
        return new GroupSpaceResponse(result.room(), result.revision(), result.canEdit(), result.updatedAt(),
                result.blueprintRef(), result.geometry(), result.spawn(), result.defaultRoom());
    }
}

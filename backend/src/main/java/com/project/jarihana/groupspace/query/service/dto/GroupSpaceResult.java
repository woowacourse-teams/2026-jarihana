package com.project.jarihana.groupspace.query.service.dto;

import com.project.jarihana.groupspace.domain.BlueprintRef;
import java.time.LocalDateTime;
import tools.jackson.databind.JsonNode;

public record GroupSpaceResult(JsonNode room, long revision, boolean canEdit, LocalDateTime updatedAt,
                                BlueprintRef blueprintRef, JsonNode geometry, JsonNode spawn, JsonNode defaultRoom) {}

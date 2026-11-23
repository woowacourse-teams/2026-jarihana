package com.project.jarihana.groupspace.command.service.dto;

import com.project.jarihana.groupspace.domain.BlueprintRef;
import java.time.LocalDateTime;
import tools.jackson.databind.JsonNode;

public record SaveGroupSpaceResult(JsonNode room, long revision, boolean canEdit, LocalDateTime updatedAt,
                                BlueprintRef blueprintRef, JsonNode geometry, JsonNode spawn) {}

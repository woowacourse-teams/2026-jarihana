package com.project.jarihana.groupspace.query.service.dto;

import java.time.LocalDateTime;
import tools.jackson.databind.JsonNode;

public record GroupSpaceResult(JsonNode room, long revision, boolean canEdit, LocalDateTime updatedAt) {}

package com.project.jarihana.groupspace.command.service.dto;

import com.project.jarihana.groupspace.domain.BlueprintRef;
import tools.jackson.databind.JsonNode;

public record SaveGroupSpaceCommand(JsonNode room, long expectedRevision, BlueprintRef blueprintRef, boolean replaceLayout) {}

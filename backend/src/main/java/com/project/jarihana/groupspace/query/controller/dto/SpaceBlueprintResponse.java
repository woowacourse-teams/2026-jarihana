package com.project.jarihana.groupspace.query.controller.dto;

import com.project.jarihana.groupspace.domain.BlueprintRef;
import com.project.jarihana.groupspace.domain.SpaceBlueprint;
import tools.jackson.databind.JsonNode;

public record SpaceBlueprintResponse(BlueprintRef blueprintRef, JsonNode geometry) {
    public static SpaceBlueprintResponse from(SpaceBlueprint blueprint) {
        return new SpaceBlueprintResponse(blueprint.ref(), blueprint.geometry());
    }
}

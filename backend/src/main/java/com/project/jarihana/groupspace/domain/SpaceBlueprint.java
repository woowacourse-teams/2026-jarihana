package com.project.jarihana.groupspace.domain;

import tools.jackson.databind.JsonNode;

public record SpaceBlueprint(BlueprintRef ref, JsonNode geometry, JsonNode spawn, JsonNode defaultRoom) {
}

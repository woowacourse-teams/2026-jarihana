package com.project.jarihana.groupspace.domain;

import tools.jackson.databind.JsonNode;

public record BlueprintRef(String templateKey, int version) {
    public static final BlueprintRef UNSAVED_ROOM = new BlueprintRef("lounge", 11);

    public static BlueprintRef historical(JsonNode room) {
        return new BlueprintRef(room.path("template").asString(), room.path("version").asInt());
    }
}

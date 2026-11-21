package com.project.jarihana.groupspace.domain;

import tools.jackson.databind.node.ObjectNode;

public record FurnitureType(String kind, int minRoomVersion, boolean placeable, ObjectNode definition) {
    public boolean isProp() {
        return definition.path("prop").asBoolean(false);
    }

    public int surfaceCount() {
        return definition.path("surfaces").size();
    }
}

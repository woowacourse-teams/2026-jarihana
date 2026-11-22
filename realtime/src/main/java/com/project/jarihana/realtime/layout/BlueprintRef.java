package com.project.jarihana.realtime.layout;

public record BlueprintRef(String templateKey, int version) {
    public static final BlueprintRef UNSAVED_ROOM = new BlueprintRef("lounge", 11);
}

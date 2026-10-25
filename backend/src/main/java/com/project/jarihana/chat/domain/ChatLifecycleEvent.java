package com.project.jarihana.chat.domain;

public record ChatLifecycleEvent(Type type, long groupId, long memberId) {
    public enum Type {
        JOINED,
        CLOSED,
        REMOVED
    }
}

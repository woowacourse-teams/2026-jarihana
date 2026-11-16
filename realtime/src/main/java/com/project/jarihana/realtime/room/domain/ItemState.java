package com.project.jarihana.realtime.room.domain;

public record ItemState(String id, String kind, String holderId, String sourceAssetId, Location location,
        Vec3 position, String assetId, Integer slot, double remaining, Vec3 velocity, long startedAt) {
    public enum Location { HELD, WORLD, SURFACE, STORAGE, THROWN }

    public ItemState hold(ParticipantState actor) {
        return new ItemState(id, kind, actor.memberId(), sourceAssetId, Location.HELD, actor.position(), null,
                null, remaining, null, 0);
    }

    public ItemState place(Location target, Vec3 point, String targetAssetId, Integer targetSlot) {
        return new ItemState(id, kind, null, sourceAssetId, target, point, targetAssetId, targetSlot, remaining, null, 0);
    }

    public ItemState consume(String emptyKind) {
        double next = Math.max(0, remaining - 0.34);
        String nextKind = next == 0 && emptyKind != null ? emptyKind : kind;
        return new ItemState(id, nextKind, holderId, sourceAssetId, location, position, assetId, slot, next, velocity, startedAt);
    }

    public ItemState fill(String drink) {
        return new ItemState(id, drink, holderId, sourceAssetId, location, position, assetId, slot, 1, velocity, startedAt);
    }
}

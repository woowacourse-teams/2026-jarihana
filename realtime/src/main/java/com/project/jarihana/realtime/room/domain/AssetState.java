package com.project.jarihana.realtime.room.domain;

public record AssetState(boolean open, boolean on, long wateredAt, Production production) {
    public record Production(String id, String itemId, String kind, long startedAt, long completesAt, String memberId) {}
    public static AssetState initial() { return new AssetState(false, true, 0, null); }
    public AssetState opened(boolean value) { return new AssetState(value, on, wateredAt, production); }
    public AssetState switched() { return new AssetState(open, !on, wateredAt, production); }
    public AssetState watered(long now) { return new AssetState(open, on, now, production); }
    public AssetState producing(Production value) { return new AssetState(open, on, wateredAt, value); }
}

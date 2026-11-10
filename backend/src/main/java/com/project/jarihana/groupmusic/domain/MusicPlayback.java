package com.project.jarihana.groupmusic.domain;

import java.time.Instant;

public record MusicPlayback(PlaybackState state, int playlistIndex, double positionSeconds, Instant anchorTime, long revision) {
    public static MusicPlayback of(PlaybackState state, int playlistIndex, double positionSeconds, Instant anchorTime, long revision) {
        return new MusicPlayback(state, playlistIndex, positionSeconds, anchorTime, revision);
    }
}

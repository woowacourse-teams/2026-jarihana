package com.project.jarihana.groupmusic.domain;

import java.time.Duration;
import java.time.Instant;

public record MusicPlayback(PlaybackState state, int playlistIndex, double positionSeconds, Instant anchorTime, long revision) {
    public static MusicPlayback of(PlaybackState state, int playlistIndex, double positionSeconds, Instant anchorTime, long revision) {
        return new MusicPlayback(state, playlistIndex, positionSeconds, anchorTime, revision);
    }

    public double positionAt(Instant now) {
        if (state == PlaybackState.PAUSED) {
            return positionSeconds;
        }
        return positionSeconds + Math.max(0, Duration.between(anchorTime, now).toMillis() / 1000.0);
    }
}

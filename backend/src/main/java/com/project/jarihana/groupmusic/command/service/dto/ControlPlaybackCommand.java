package com.project.jarihana.groupmusic.command.service.dto;

import com.project.jarihana.groupmusic.domain.PlaybackState;

public record ControlPlaybackCommand(long expectedRevision, PlaybackState state, int playlistIndex, double positionSeconds, String expectedCurrentQueueId) {}

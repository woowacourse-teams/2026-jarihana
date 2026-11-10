package com.project.jarihana.groupmusic.command.service.dto;

public record AdvancePlaybackCommand(long expectedRevision, int playlistIndex, double trackDurationSeconds, int queueLength) {}

package com.project.jarihana.groupmusic.query.controller.dto;

import com.project.jarihana.groupmusic.query.service.dto.GroupMusicResult;
import java.time.LocalDateTime;
import java.time.Instant;
import com.project.jarihana.groupmusic.domain.MusicPlayback;
import tools.jackson.databind.JsonNode;

public record GroupMusicResponse(JsonNode music, long revision, boolean canEdit, boolean canAdd, LocalDateTime updatedAt, Instant serverTime, MusicPlayback playback) {
    public static GroupMusicResponse from(GroupMusicResult result) {
        return new GroupMusicResponse(result.music(), result.revision(), result.canEdit(), result.canAdd(), result.updatedAt(), result.serverTime(), result.playback());
    }
}

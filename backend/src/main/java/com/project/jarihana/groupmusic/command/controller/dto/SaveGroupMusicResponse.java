package com.project.jarihana.groupmusic.command.controller.dto;

import com.project.jarihana.groupmusic.command.service.dto.SaveGroupMusicResult;
import java.time.LocalDateTime;
import java.time.Instant;
import com.project.jarihana.groupmusic.domain.MusicPlayback;
import tools.jackson.databind.JsonNode;

public record SaveGroupMusicResponse(JsonNode music, long revision, boolean canEdit, boolean canAdd, LocalDateTime updatedAt, Instant serverTime, MusicPlayback playback) {
    public static SaveGroupMusicResponse from(SaveGroupMusicResult result) {
        return new SaveGroupMusicResponse(result.music(), result.revision(), result.canEdit(), result.canAdd(), result.updatedAt(), result.serverTime(), result.playback());
    }
}

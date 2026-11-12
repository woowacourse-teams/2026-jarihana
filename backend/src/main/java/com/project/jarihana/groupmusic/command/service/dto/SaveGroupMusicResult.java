package com.project.jarihana.groupmusic.command.service.dto;

import java.time.LocalDateTime;
import java.time.Instant;
import com.project.jarihana.groupmusic.domain.MusicPlayback;
import tools.jackson.databind.JsonNode;

public record SaveGroupMusicResult(JsonNode music, long revision, boolean canEdit, boolean canAdd, LocalDateTime updatedAt, Instant serverTime, MusicPlayback playback) {}

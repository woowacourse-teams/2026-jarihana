package com.project.jarihana.groupmusic.query.service.dto;

import java.time.LocalDateTime;
import java.time.Instant;
import com.project.jarihana.groupmusic.domain.MusicPlayback;
import tools.jackson.databind.JsonNode;

public record GroupMusicResult(JsonNode music, long revision, boolean canEdit, boolean canAdd, LocalDateTime updatedAt, Instant serverTime, MusicPlayback playback) {}

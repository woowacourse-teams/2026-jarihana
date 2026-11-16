package com.project.jarihana.realtime.auth;

import com.project.jarihana.realtime.room.domain.AvatarAppearance;
import tools.jackson.databind.JsonNode;

public record Admission(String roomId, String memberId, String displayName, String avatarColor, AvatarAppearance avatarAppearance,
        String role, long leaseExpiresAt, long layoutRevision, JsonNode room) {}

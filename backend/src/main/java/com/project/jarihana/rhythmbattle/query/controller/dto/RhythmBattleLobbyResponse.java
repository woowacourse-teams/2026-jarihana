package com.project.jarihana.rhythmbattle.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleLobbyResult;

import java.time.LocalDateTime;
import java.util.List;

public record RhythmBattleLobbyResponse(List<Item> items, String nextCursor, boolean hasNext) {
    public static RhythmBattleLobbyResponse from(RhythmBattleLobbyResult result) {
        return new RhythmBattleLobbyResponse(result.items().stream()
                .map(item -> new Item(item.id(), item.hostName(), GithubAvatarUrl.from(item.hostGithubId()), item.level(),
                        item.createdAt()))
                .toList(), result.nextCursor(), result.hasNext());
    }

    public record Item(long id, String hostName, String hostAvatarUrl, RhythmLevel level, LocalDateTime createdAt) {
    }
}

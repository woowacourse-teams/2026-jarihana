package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.gomoku.query.service.dto.GomokuSpectatorResult;

import java.util.List;

public record GomokuSpectatorsResponse(long roomId, List<SpectatorResponse> spectators) {
    public GomokuSpectatorsResponse {
        spectators = List.copyOf(spectators);
    }

    public static GomokuSpectatorsResponse from(long roomId, List<GomokuSpectatorResult> spectators) {
        return new GomokuSpectatorsResponse(
                roomId,
                spectators.stream()
                        .map(person -> new SpectatorResponse(person.memberId(), person.name(),
                                person.githubId() == null ? null : GithubAvatarUrl.from(person.githubId())))
                        .toList());
    }

    public record SpectatorResponse(long memberId, String name, String avatarUrl) {}
}

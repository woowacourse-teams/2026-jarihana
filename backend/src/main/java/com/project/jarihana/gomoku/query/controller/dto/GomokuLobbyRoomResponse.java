package com.project.jarihana.gomoku.query.controller.dto;

import com.project.jarihana.common.github.GithubAvatarUrl;
import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

public record GomokuLobbyRoomResponse(
        long id,
        long hostMemberId,
        String hostName,
        String hostAvatarUrl,
        Long guestMemberId,
        String guestName,
        String guestAvatarUrl,
        RoomVisibility visibility,
        GomokuRule rule,
        RoomStatus status) {
    public static GomokuLobbyRoomResponse from(GomokuRoomResult value) {
        return new GomokuLobbyRoomResponse(
                value.id(),
                value.hostMemberId(),
                value.hostName(),
                value.hostGithubId() == null ? null : GithubAvatarUrl.from(value.hostGithubId()),
                value.guestMemberId(),
                value.guestName(),
                value.guestGithubId() == null ? null : GithubAvatarUrl.from(value.guestGithubId()),
                value.visibility(),
                value.rule(),
                value.status());
    }
}

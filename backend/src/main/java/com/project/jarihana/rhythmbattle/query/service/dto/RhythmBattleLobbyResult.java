package com.project.jarihana.rhythmbattle.query.service.dto;

import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRoomProjection;

import java.time.LocalDateTime;
import java.util.List;

public record RhythmBattleLobbyResult(List<Item> items, String nextCursor, boolean hasNext) {
    public RhythmBattleLobbyResult {
        items = List.copyOf(items);
    }

    public record Item(long id, String hostName, String hostGithubId, RhythmLevel level, LocalDateTime createdAt) {
        public static Item from(RhythmBattleRoomProjection room) {
            return new Item(room.getId(), room.getHostName(), room.getHostGithubId(), room.getLevel(),
                    room.getCreatedAt());
        }
    }
}

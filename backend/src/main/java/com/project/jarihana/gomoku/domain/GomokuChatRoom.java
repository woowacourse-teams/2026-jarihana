package com.project.jarihana.gomoku.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "gomoku_chat_room")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuChatRoom {
    @Id
    @Column(name = "room_id")
    private Long id;
    private long lastSequence;

    private GomokuChatRoom(long roomId, long lastSequence) {
        id = roomId;
        this.lastSequence = lastSequence;
    }

    public static GomokuChatRoom create(long roomId) {
        return new GomokuChatRoom(roomId, 0);
    }

    public GomokuChatRoom nextMessage() {
        return new GomokuChatRoom(id, lastSequence + 1);
    }
}

package com.project.jarihana.chat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.Accessors;

import java.util.Objects;

@Entity
@Table(name = "chat_room")
@Getter
@Accessors(fluent = true)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatRoom {
    @Id
    @Column(name = "group_id")
    private Long id;

    @Column(name = "last_sequence", nullable = false)
    private long lastSequence;

    private ChatRoom(Long id, long lastSequence) {
        this.id = id;
        this.lastSequence = lastSequence;
    }

    public static ChatRoom create(long groupId) {
        return new ChatRoom(groupId, 0);
    }

    public ChatRoom nextMessage() {
        return new ChatRoom(id, lastSequence + 1);
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ChatRoom state)) return false;
        return id != null && id.equals(state.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}

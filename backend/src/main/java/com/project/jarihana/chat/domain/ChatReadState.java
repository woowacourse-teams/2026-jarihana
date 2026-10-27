package com.project.jarihana.chat.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.experimental.Accessors;

import java.io.Serializable;
import java.util.Objects;

@Entity
@Table(name = "chat_read_state")
@Getter
@Accessors(fluent = true)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatReadState {
    @EmbeddedId private Id id;

    @Column(name = "last_read_sequence", nullable = false)
    private long lastReadSequence;

    private ChatReadState(Id id, long lastReadSequence) {
        this.id = id;
        this.lastReadSequence = lastReadSequence;
    }

    public static ChatReadState create(Id id) {
        return new ChatReadState(id, 0);
    }

    public ChatReadState advanceTo(long sequence) {
        return new ChatReadState(id, Math.max(lastReadSequence, sequence));
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof ChatReadState state)) return false;
        return id != null && id.equals(state.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Embeddable
    @EqualsAndHashCode
    @NoArgsConstructor(access = AccessLevel.PROTECTED)
    public static class Id implements Serializable {
        @Column(name = "group_id", nullable = false)
        private Long groupId;

        @Column(name = "member_id", nullable = false)
        private Long memberId;

        public Id(long groupId, long memberId) {
            this.groupId = groupId;
            this.memberId = memberId;
        }
    }
}

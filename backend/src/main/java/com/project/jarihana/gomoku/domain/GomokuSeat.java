package com.project.jarihana.gomoku.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;
import java.util.UUID;

@Getter
@Entity
@Table(name = "gomoku_seat")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuSeat {
    @Id
    @Column(name = "member_id")
    private Long id;

    private long roomId;

    private long chatStartSequence;

    @Column(nullable = false)
    private UUID participationId;

    private GomokuSeat(long memberId, long roomId, long chatStartSequence) {
        this.id = memberId;
        this.roomId = roomId;
        this.chatStartSequence = chatStartSequence;
        participationId = UUID.randomUUID();
    }

    public static GomokuSeat claim(long memberId, long roomId) {
        return claim(memberId, roomId, 0);
    }

    public static GomokuSeat claim(long memberId, long roomId, long chatStartSequence) {
        return new GomokuSeat(memberId, roomId, chatStartSequence);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object value) {
        if (this == value) return true;
        return value instanceof GomokuSeat other && id != null && id.equals(other.id);
    }
}

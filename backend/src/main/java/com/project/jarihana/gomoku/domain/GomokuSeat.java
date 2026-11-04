package com.project.jarihana.gomoku.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Objects;

@Getter
@Entity
@Table(name = "gomoku_seat")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuSeat {
    @Id
    @Column(name = "member_id")
    private Long id;

    private long roomId;

    private GomokuSeat(long memberId, long roomId) {
        this.id = memberId;
        this.roomId = roomId;
    }

    public static GomokuSeat claim(long memberId, long roomId) {
        return new GomokuSeat(memberId, roomId);
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

package com.project.jarihana.gomoku.domain;

import com.project.jarihana.common.domain.BaseEntity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Getter
@Entity
@Table(name = "gomoku_move")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuMove extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private long roomId;
    private int gameNumber;
    private long memberId;
    private int ply;
    private int x;
    private int y;
    private UUID requestId;

    private GomokuMove(
            long roomId,
            int gameNumber,
            long memberId,
            int ply,
            int x,
            int y,
            UUID requestId,
            LocalDateTime now) {
        super(now);
        this.roomId = roomId;
        this.gameNumber = gameNumber;
        this.memberId = memberId;
        this.ply = ply;
        this.x = x;
        this.y = y;
        this.requestId = requestId;
    }

    public static GomokuMove placed(
            long roomId,
            int gameNumber,
            long memberId,
            int ply,
            int x,
            int y,
            UUID requestId,
            LocalDateTime now) {
        return new GomokuMove(roomId, gameNumber, memberId, ply, x, y, requestId, now);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object value) {
        if (this == value) return true;
        return value instanceof GomokuMove other && id != null && id.equals(other.id);
    }
}

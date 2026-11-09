package com.project.jarihana.gomoku.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Objects;

@Getter
@Entity
@Table(name = "gomoku_game")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuGame extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long roomId;
    private int gameNumber;
    private long hostMemberId;
    private long guestMemberId;
    @Column(length = 50)
    private String hostName;
    @Column(length = 50)
    private String guestName;
    private long blackMemberId;
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private GomokuRule rule;
    private Long winnerMemberId;
    @Column(length = 16)
    private String endReason;
    private int ply;
    private LocalDateTime endedAt;

    private GomokuGame(GomokuRoom room, LocalDateTime now) {
        super(now);
        roomId = room.getId();
        gameNumber = room.getGameNumber();
        hostMemberId = room.getHostMemberId();
        guestMemberId = room.getGuestMemberId();
        hostName = room.getHostName();
        guestName = room.getGuestName();
        blackMemberId = room.getBlackMemberId();
        rule = room.getRule();
    }

    private GomokuGame(GomokuGame previous, GomokuRoom result, LocalDateTime endedAt) {
        super(previous.getCreatedAt());
        id = previous.id;
        roomId = previous.roomId;
        gameNumber = previous.gameNumber;
        hostMemberId = previous.hostMemberId;
        guestMemberId = previous.guestMemberId;
        hostName = previous.hostName;
        guestName = previous.guestName;
        blackMemberId = previous.blackMemberId;
        rule = previous.rule;
        winnerMemberId = result.getWinnerMemberId();
        endReason = result.getEndReason();
        ply = result.getPly();
        this.endedAt = endedAt;
    }

    public static GomokuGame started(GomokuRoom room, LocalDateTime now) {
        if (room.getStatus() != RoomStatus.PLAYING) throw new IllegalArgumentException("진행 중인 대국만 기록할 수 있습니다.");
        return new GomokuGame(room, now);
    }

    public GomokuGame complete(GomokuRoom result, LocalDateTime time) {
        if (result.getId() != roomId || result.getGameNumber() != gameNumber
                || result.getEndReason() == null || result.getStatus() == RoomStatus.PLAYING) {
            throw new IllegalArgumentException("같은 판의 종료 결과가 필요합니다.");
        }
        return endedAt == null ? new GomokuGame(this, result, time) : this;
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof GomokuGame game && id != null && id.equals(game.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}

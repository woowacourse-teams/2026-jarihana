package com.project.jarihana.rhythmbattle.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.rhythm.domain.RhythmLevel;

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

/**
 * 시작한 대전 한 판의 기록이다. 시작할 때 두 참가자와 난이도를 남기고, 끝나면 승자와 이유를 확정한다.
 * 다시 대결하거나 방이 닫혀도 지난 판의 기록은 바꾸지 않는다.
 */
@Getter
@Entity
@Table(name = "rhythm_battle_game")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmBattleGame extends BaseEntity {
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
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private RhythmLevel level;
    private Long winnerMemberId;
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private BattleEndReason endReason;
    private LocalDateTime endedAt;

    private RhythmBattleGame(RhythmBattleRoom room, LocalDateTime now) {
        super(now);
        roomId = room.getId();
        gameNumber = room.getGameNumber();
        hostMemberId = room.getHostMemberId();
        guestMemberId = Objects.requireNonNull(room.getGuestMemberId());
        hostName = room.getHostName();
        guestName = room.getGuestName();
        level = room.getLevel();
    }

    private RhythmBattleGame(RhythmBattleGame previous) {
        super(previous.getCreatedAt());
        id = previous.id;
        roomId = previous.roomId;
        gameNumber = previous.gameNumber;
        hostMemberId = previous.hostMemberId;
        guestMemberId = previous.guestMemberId;
        hostName = previous.hostName;
        guestName = previous.guestName;
        level = previous.level;
        winnerMemberId = previous.winnerMemberId;
        endReason = previous.endReason;
        endedAt = previous.endedAt;
    }

    public static RhythmBattleGame start(RhythmBattleRoom started, LocalDateTime now) {
        return new RhythmBattleGame(started, now);
    }

    public RhythmBattleGame finish(BattleOutcome outcome, LocalDateTime now) {
        if (endedAt != null) {
            return this;
        }
        RhythmBattleGame next = new RhythmBattleGame(this);
        next.winnerMemberId = outcome.winnerMemberId();
        next.endReason = outcome.reason();
        next.endedAt = now;
        return next;
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof RhythmBattleGame game && id != null && id.equals(game.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}

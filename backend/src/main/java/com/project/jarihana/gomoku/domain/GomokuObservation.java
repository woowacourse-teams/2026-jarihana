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
import java.util.UUID;

@Entity
@Table(name = "gomoku_observation")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuObservation extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long roomId;
    private long memberId;
    private UUID requestId;
    private UUID participationId;
    private long chatStartSequence;
    private LocalDateTime leftAt;

    private GomokuObservation(long roomId, long memberId, UUID requestId, long sequence, LocalDateTime now) {
        super(now);
        this.roomId = roomId;
        this.memberId = memberId;
        this.requestId = requestId;
        this.participationId = UUID.randomUUID();
        this.chatStartSequence = sequence;
    }

    public static GomokuObservation enter(long roomId, long memberId, UUID requestId, long sequence, LocalDateTime now) {
        return new GomokuObservation(roomId, memberId, requestId, sequence, now);
    }

    private GomokuObservation(GomokuObservation previous, LocalDateTime leftAt) {
        super(previous.getCreatedAt());
        this.id = previous.id;
        this.roomId = previous.roomId;
        this.memberId = previous.memberId;
        this.requestId = previous.requestId;
        this.participationId = previous.participationId;
        this.chatStartSequence = previous.chatStartSequence;
        this.leftAt = leftAt;
    }

    public GomokuObservation leave(LocalDateTime now) {
        return leftAt == null ? new GomokuObservation(this, now) : this;
    }
}

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
@Table(name = "gomoku_observer_connection")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuObserverConnection extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long observationId;
    private UUID connectionId;
    private LocalDateTime expiresAt;

    private GomokuObserverConnection(long observationId, LocalDateTime now) {
        super(now);
        this.observationId = observationId;
        this.connectionId = UUID.randomUUID();
        this.expiresAt = now.plusSeconds(45);
    }

    public static GomokuObserverConnection open(long observationId, LocalDateTime now) {
        return new GomokuObserverConnection(observationId, now);
    }
}

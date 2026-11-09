package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 막대 하나를 자른 기록이다. 수상자를 확인할 때 막대마다 자른 위치와 걸린 시간을 다시 볼 수 있게 남긴다.
 */
@Entity
@Table(
        name = "minigame_cut",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_minigame_cut_run_round",
                columnNames = {"run_id", "round_number"}
        )
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MinigameCut extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "run_id", nullable = false)
    private MinigameRun run;

    @Column(name = "round_number", nullable = false)
    private int roundNumber;

    @Column(name = "position_cm", nullable = false)
    private double positionCm;

    @Column(name = "error_rate", nullable = false)
    private double errorRate;

    @Column(name = "score", nullable = false)
    private int score;

    @Column(name = "duration_millis", nullable = false)
    private long durationMillis;

    @Column(name = "timed_out", nullable = false)
    private boolean timedOut;

    private MinigameCut(MinigameRun run, RoundCut cut, LocalDateTime createdAt) {
        super(createdAt);
        if (run == null || cut == null || createdAt == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "자른 기록에 필요한 값이 없습니다.");
        }
        this.run = run;
        this.roundNumber = cut.round();
        this.positionCm = cut.position();
        this.errorRate = cut.judgement().errorRate();
        this.score = cut.score();
        this.durationMillis = cut.durationMillis();
        this.timedOut = cut.timedOut();
    }

    public static MinigameCut record(MinigameRun run, RoundCut cut, LocalDateTime createdAt) {
        return new MinigameCut(run, cut, createdAt);
    }

    public Long getId() {
        return id;
    }

    public int getRoundNumber() {
        return roundNumber;
    }

    public double getPositionCm() {
        return positionCm;
    }

    public double getErrorRate() {
        return errorRate;
    }

    public int getScore() {
        return score;
    }

    public long getDurationMillis() {
        return durationMillis;
    }

    public boolean isTimedOut() {
        return timedOut;
    }
}

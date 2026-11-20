package com.project.jarihana.rhythmbattle.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythm.domain.RhythmEngine;
import com.project.jarihana.rhythm.domain.RhythmInput;
import com.project.jarihana.rhythm.domain.RhythmLevel;
import com.project.jarihana.rhythm.domain.RhythmScore;

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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 대전 한 판에서 한 사람이 치는 판이다. 랭킹 도전처럼 입력 묶음을 서버 엔진으로 다시 계산하지만,
 * 기록은 랭킹에 넣지 않고 판의 승패를 정하는 데만 쓴다. 실제 경과 시간은 방이 정한 공통 시작 시각부터 잰다.
 */
@Getter
@Entity
@Table(name = "rhythm_battle_run")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmBattleRun extends BaseEntity {
    // 이 시간 동안 입력 묶음이 오지 않으면 연결이 끊긴 것으로 보고 탈락시킨다. 시작 전에는 공통 시작 시각부터 잰다.
    static final Duration STALE_AFTER = Duration.ofSeconds(30);
    // 진행 시각이 실제 경과 시간보다 이만큼 이상 늦으면 멈췄다가 이어 한 것으로 본다.
    static final double MAX_LAG_SECONDS = 15;
    // 실시간 알림을 늦게 받아 음악을 늦게 튼 차이와 시계 오차를 허용한다.
    static final double AHEAD_TOLERANCE_SECONDS = 3;
    static final int MAX_INPUTS_PER_BATCH = 400;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private long roomId;
    private int gameNumber;
    private long memberId;
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private RhythmLevel level;
    private double scrollSpeed;
    private int seed;
    @Column(length = 40)
    private String rulesVersion;
    @Column(length = 40)
    private String chartVersion;
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private BattleRunStatus status;
    private LocalDateTime startsAt;
    private LocalDateTime lastBatchAt;
    private int lastSequence;
    private double playedUntil;
    private Double lastInputAt;
    private long score;
    private int combo;
    private int bestCombo;
    private int perfectCount;
    private int hitCount;
    private int enoughCount;
    private int uhohCount;
    private int poorCount;
    private int missCount;
    private int loopReached;
    private int lives;
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private BattleOutReason outReason;
    private Double outAt;
    private LocalDateTime endedAt;

    private RhythmBattleRun(long roomId, int gameNumber, long memberId, RhythmLevel level, double scrollSpeed,
            int seed, RhythmChart chart, int lives, LocalDateTime startsAt) {
        super(startsAt);
        this.roomId = roomId;
        this.gameNumber = gameNumber;
        this.memberId = memberId;
        this.level = level;
        this.scrollSpeed = scrollSpeed;
        this.seed = seed;
        this.rulesVersion = chart.getRulesVersion();
        this.chartVersion = chart.chartVersion(level);
        this.status = BattleRunStatus.PLAYING;
        this.startsAt = startsAt;
        this.lastBatchAt = startsAt;
        this.loopReached = 1;
        this.lives = lives;
    }

    private RhythmBattleRun(RhythmBattleRun previous) {
        super(previous.getCreatedAt());
        id = previous.id;
        roomId = previous.roomId;
        gameNumber = previous.gameNumber;
        memberId = previous.memberId;
        level = previous.level;
        scrollSpeed = previous.scrollSpeed;
        seed = previous.seed;
        rulesVersion = previous.rulesVersion;
        chartVersion = previous.chartVersion;
        status = previous.status;
        startsAt = previous.startsAt;
        lastBatchAt = previous.lastBatchAt;
        lastSequence = previous.lastSequence;
        playedUntil = previous.playedUntil;
        lastInputAt = previous.lastInputAt;
        score = previous.score;
        combo = previous.combo;
        bestCombo = previous.bestCombo;
        perfectCount = previous.perfectCount;
        hitCount = previous.hitCount;
        enoughCount = previous.enoughCount;
        uhohCount = previous.uhohCount;
        poorCount = previous.poorCount;
        missCount = previous.missCount;
        loopReached = previous.loopReached;
        lives = previous.lives;
        outReason = previous.outReason;
        outAt = previous.outAt;
        endedAt = previous.endedAt;
    }

    /**
     * 방이 정한 시드와 공통 시작 시각으로 판을 만든다. 생성 시각은 공통 시작 시각으로 남긴다.
     */
    public static RhythmBattleRun create(long roomId, int gameNumber, long memberId, RhythmLevel level,
            double scrollSpeed, int seed, RhythmChart chart, LocalDateTime startsAt) {
        RhythmEngine engine = RhythmEngine.start(chart, level, scrollSpeed, seed);
        return new RhythmBattleRun(roomId, gameNumber, memberId, level, scrollSpeed, seed, chart, engine.lives(),
                startsAt);
    }

    public boolean isOut() {
        return status == BattleRunStatus.OUT;
    }

    public RhythmEngine newEngine(RhythmChart chart) {
        if (!chart.getRulesVersion().equals(rulesVersion) || !chart.chartVersion(level).equals(chartVersion)) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_CONFLICT, "대전을 시작한 뒤 게임 규칙이 바뀌었어요. 다시 시작해 주세요.");
        }
        return RhythmEngine.start(chart, level, scrollSpeed, seed);
    }

    public BattleProgress progress() {
        if (!isOut()) {
            return BattleProgress.alive(memberId, playedUntil);
        }
        return BattleProgress.out(memberId, outReason, outAt, playedUntil);
    }

    /**
     * 다음 순번의 묶음인지, 공통 시작 시각부터 실제로 흐른 시간과 맞게 진행했는지 확인한다.
     * 시간이 맞지 않으면 탈락 이유를 돌려준다.
     */
    public BattleOutReason checkBatch(int sequence, double batchPlayedUntil, List<RhythmInput> inputs,
            LocalDateTime now) {
        if (isOut()) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_CONFLICT, "이미 끝난 판이에요.");
        }
        if (sequence != lastSequence + 1) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_CONFLICT, "입력 묶음 순서가 맞지 않아요.");
        }
        validateInputs(batchPlayedUntil, inputs);
        double elapsed = Duration.between(startsAt, now).toNanos() / 1_000_000_000.0;
        if (batchPlayedUntil > elapsed + AHEAD_TOLERANCE_SECONDS) {
            return BattleOutReason.CLOCK_AHEAD;
        }
        if (batchPlayedUntil < elapsed - MAX_LAG_SECONDS) {
            return BattleOutReason.LAGGED;
        }
        return null;
    }

    private void validateInputs(double batchPlayedUntil, List<RhythmInput> inputs) {
        if (!Double.isFinite(batchPlayedUntil) || batchPlayedUntil < playedUntil) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "진행 시각이 앞선 묶음보다 늦어야 해요.");
        }
        if (inputs.size() > MAX_INPUTS_PER_BATCH) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "한 번에 보낼 수 있는 입력이 너무 많아요.");
        }
        // 서버가 이미 계산한 구간에 뒤늦게 입력을 넣을 수 없게 앞선 묶음의 진행 시각 이후만 받는다.
        double previous = lastInputAt == null ? Double.NEGATIVE_INFINITY : lastInputAt;
        if (lastSequence > 0) {
            previous = Math.max(previous, playedUntil);
        }
        for (RhythmInput input : inputs) {
            if (input.at() < previous || input.at() > batchPlayedUntil) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "입력 시각의 순서가 올바르지 않아요.");
            }
            previous = input.at();
        }
    }

    /**
     * 서버 엔진으로 다시 계산한 결과를 반영한다. 라이프를 모두 잃었으면 그 곡 시각에 탈락한 것으로 끝낸다.
     */
    public RhythmBattleRun record(int sequence, double batchPlayedUntil, List<RhythmInput> inputs,
            RhythmEngine engine, LocalDateTime now) {
        RhythmBattleRun next = new RhythmBattleRun(this);
        next.lastSequence = sequence;
        next.playedUntil = batchPlayedUntil;
        next.lastBatchAt = now;
        if (!inputs.isEmpty()) {
            next.lastInputAt = inputs.getLast().at();
        }
        RhythmScore result = engine.score();
        next.score = result.score();
        next.combo = engine.combo();
        next.bestCombo = result.bestCombo();
        next.perfectCount = result.perfect();
        next.hitCount = result.hit();
        next.enoughCount = result.enough();
        next.uhohCount = result.uhoh();
        next.poorCount = result.poor();
        next.missCount = result.miss();
        next.loopReached = result.loopReached();
        next.lives = engine.lives();
        if (engine.dead()) {
            next.status = BattleRunStatus.OUT;
            next.outReason = BattleOutReason.ELIMINATED;
            next.outAt = engine.deadAt().getAsDouble();
            next.endedAt = now;
        }
        return next;
    }

    /**
     * 나가기, 화면 이탈, 연결 끊김, 시각 위반으로 판을 끝낸다. 이미 끝난 판이면 그대로 둔다.
     */
    public RhythmBattleRun forfeit(BattleOutReason reason, LocalDateTime now) {
        if (isOut()) {
            return this;
        }
        RhythmBattleRun next = new RhythmBattleRun(this);
        next.status = BattleRunStatus.OUT;
        next.outReason = reason;
        next.outAt = playedUntil;
        next.endedAt = now;
        return next;
    }

    public RhythmBattleRun expire(LocalDateTime now) {
        if (!isOut() && !now.isBefore(lastBatchAt.plus(STALE_AFTER))) {
            return forfeit(BattleOutReason.STALE, now);
        }
        return this;
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof RhythmBattleRun run && id != null && id.equals(run.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}

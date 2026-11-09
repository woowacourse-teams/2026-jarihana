package com.project.jarihana.rhythm.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;

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
 * 행성이의 리듬 작살 공식 도전 한 판이다.
 *
 * <p>서버가 시드를 정하고, 클라이언트는 몇 초마다 입력 묶음을 보낸다. 서버는 받은 입력으로 점수를 다시 계산하고
 * 실제 경과 시간과 진행 시각을 비교해 멈추거나 미리 만든 입력을 무효로 처리한다. 무효가 된 판은 기록하지 않는다.
 */
@Getter
@Entity
@Table(name = "rhythm_challenge")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmChallenge extends BaseEntity {
    // 만든 뒤 이 시간 안에 시작하지 않으면 무효다. 음악과 그림을 불러오는 시간을 넉넉히 둔다.
    static final Duration START_DEADLINE = Duration.ofMinutes(5);
    // 진행 중인데 이 시간 동안 입력 묶음이 오지 않으면 무효다.
    static final Duration STALE_AFTER = Duration.ofSeconds(30);
    // 진행 시각이 서버 경과 시간보다 이만큼 이상 늦으면 멈췄다가 이어 한 것으로 본다.
    static final double MAX_LAG_SECONDS = 15;
    // 시작 요청과 음악 시작 사이의 차이와 시계 오차를 허용한다.
    static final double AHEAD_TOLERANCE_SECONDS = 3;
    static final int MAX_INPUTS_PER_BATCH = 400;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
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
    private RhythmChallengeStatus status;
    private LocalDateTime startedAt;
    private LocalDateTime lastBatchAt;
    private int lastSequence;
    private double playedUntil;
    private Double lastInputAt;
    private long score;
    private int perfectCount;
    private int hitCount;
    private int enoughCount;
    private int uhohCount;
    private int poorCount;
    private int missCount;
    private int bestCombo;
    private int loopReached;
    private int lives;
    private LocalDateTime finishedAt;
    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private RhythmInvalidReason invalidReason;

    private RhythmChallenge(long memberId, RhythmLevel level, double scrollSpeed, int seed, RhythmChart chart,
            int lives, LocalDateTime now) {
        super(now);
        this.memberId = memberId;
        this.level = level;
        this.scrollSpeed = scrollSpeed;
        this.seed = seed;
        this.rulesVersion = chart.getRulesVersion();
        this.chartVersion = chart.getChartVersion();
        this.status = RhythmChallengeStatus.CREATED;
        this.loopReached = 1;
        this.lives = lives;
    }

    private RhythmChallenge(RhythmChallenge previous) {
        super(previous.getCreatedAt());
        id = previous.id;
        memberId = previous.memberId;
        level = previous.level;
        scrollSpeed = previous.scrollSpeed;
        seed = previous.seed;
        rulesVersion = previous.rulesVersion;
        chartVersion = previous.chartVersion;
        status = previous.status;
        startedAt = previous.startedAt;
        lastBatchAt = previous.lastBatchAt;
        lastSequence = previous.lastSequence;
        playedUntil = previous.playedUntil;
        lastInputAt = previous.lastInputAt;
        score = previous.score;
        perfectCount = previous.perfectCount;
        hitCount = previous.hitCount;
        enoughCount = previous.enoughCount;
        uhohCount = previous.uhohCount;
        poorCount = previous.poorCount;
        missCount = previous.missCount;
        bestCombo = previous.bestCombo;
        loopReached = previous.loopReached;
        lives = previous.lives;
        finishedAt = previous.finishedAt;
        invalidReason = previous.invalidReason;
    }

    public static RhythmChallenge create(long memberId, RhythmLevel level, double scrollSpeed, int seed,
            RhythmChart chart, LocalDateTime now) {
        if (level == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "난이도를 골라 주세요.");
        }
        // 배속이 맞지 않으면 엔진을 만들 수 없으므로 여기서 먼저 확인한다.
        RhythmEngine engine = RhythmEngine.start(chart, level, validScrollSpeed(scrollSpeed), seed);
        return new RhythmChallenge(memberId, level, scrollSpeed, seed, chart, engine.lives(), now);
    }

    private static double validScrollSpeed(double scrollSpeed) {
        if (!Double.isFinite(scrollSpeed) || scrollSpeed < 1 || scrollSpeed > 3
                || scrollSpeed * 4 != Math.rint(scrollSpeed * 4)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세균 이동 배속은 1.0부터 3.0까지 0.25 단위로 골라 주세요.");
        }
        return scrollSpeed;
    }

    public boolean isOwnedBy(long memberId) {
        return this.memberId == memberId;
    }

    public RhythmEngine newEngine(RhythmChart chart) {
        if (!chart.getRulesVersion().equals(rulesVersion) || !chart.getChartVersion().equals(chartVersion)) {
            throw new BusinessException(ErrorCode.RHYTHM_CHALLENGE_CONFLICT, "도전을 시작한 뒤 게임 규칙이 바뀌었어요. 새로 도전해 주세요.");
        }
        return RhythmEngine.start(chart, level, scrollSpeed, seed);
    }

    /**
     * 기한을 넘긴 판을 무효로 바꾼다. 상태가 그대로면 자기 자신을 돌려준다.
     */
    public RhythmChallenge expire(LocalDateTime now) {
        if (status == RhythmChallengeStatus.CREATED && !now.isBefore(getCreatedAt().plus(START_DEADLINE))) {
            return invalidate(RhythmInvalidReason.EXPIRED, now);
        }
        if (status == RhythmChallengeStatus.PLAYING && !now.isBefore(lastBatchAt.plus(STALE_AFTER))) {
            return invalidate(RhythmInvalidReason.STALE, now);
        }
        return this;
    }

    public RhythmChallenge start(LocalDateTime now) {
        if (status != RhythmChallengeStatus.CREATED) {
            throw new BusinessException(ErrorCode.RHYTHM_CHALLENGE_CONFLICT, "이미 시작했거나 끝난 도전이에요.");
        }
        RhythmChallenge next = new RhythmChallenge(this);
        next.status = RhythmChallengeStatus.PLAYING;
        next.startedAt = now;
        next.lastBatchAt = now;
        return next;
    }

    /**
     * 다음 순번의 묶음인지, 실제 시간과 맞게 진행했는지 확인한다. 시간이 맞지 않으면 무효 이유를 돌려준다.
     */
    public RhythmInvalidReason checkBatch(int sequence, double batchPlayedUntil, List<RhythmInput> inputs,
            LocalDateTime now) {
        if (status != RhythmChallengeStatus.PLAYING) {
            throw new BusinessException(ErrorCode.RHYTHM_CHALLENGE_CONFLICT, "진행 중인 도전이 아니에요.");
        }
        if (sequence != lastSequence + 1) {
            throw new BusinessException(ErrorCode.RHYTHM_CHALLENGE_CONFLICT, "입력 묶음 순서가 맞지 않아요.");
        }
        validateInputs(batchPlayedUntil, inputs);
        double elapsed = Duration.between(startedAt, now).toNanos() / 1_000_000_000.0;
        if (batchPlayedUntil > elapsed + AHEAD_TOLERANCE_SECONDS) {
            return RhythmInvalidReason.CLOCK_AHEAD;
        }
        if (batchPlayedUntil < elapsed - MAX_LAG_SECONDS) {
            return RhythmInvalidReason.LAGGED;
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
        // 서버가 이미 계산한 구간에 뒤늦게 입력을 넣으면 돌진 중인 세균을 다시 잡을 수 있으므로 앞선 묶음의 진행 시각 이후만 받는다.
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
     * 서버 엔진으로 다시 계산한 결과를 반영한다. 라이프를 모두 잃었으면 기록으로 끝낸다.
     */
    public RhythmChallenge record(int sequence, double batchPlayedUntil, List<RhythmInput> inputs,
            RhythmEngine engine, LocalDateTime now) {
        RhythmChallenge next = new RhythmChallenge(this);
        next.lastSequence = sequence;
        next.playedUntil = batchPlayedUntil;
        next.lastBatchAt = now;
        if (!inputs.isEmpty()) {
            next.lastInputAt = inputs.getLast().at();
        }
        RhythmScore result = engine.score();
        next.score = result.score();
        next.perfectCount = result.perfect();
        next.hitCount = result.hit();
        next.enoughCount = result.enough();
        next.uhohCount = result.uhoh();
        next.poorCount = result.poor();
        next.missCount = result.miss();
        next.bestCombo = result.bestCombo();
        next.loopReached = result.loopReached();
        next.lives = engine.lives();
        if (engine.dead()) {
            next.status = RhythmChallengeStatus.FINISHED;
            next.finishedAt = now;
        }
        return next;
    }

    public RhythmChallenge invalidate(RhythmInvalidReason reason, LocalDateTime now) {
        if (status.closed()) {
            return this;
        }
        RhythmChallenge next = new RhythmChallenge(this);
        next.status = RhythmChallengeStatus.INVALID;
        next.invalidReason = reason;
        next.finishedAt = now;
        return next;
    }

    @Override
    public boolean equals(Object other) {
        return this == other || other instanceof RhythmChallenge challenge && id != null && id.equals(challenge.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}

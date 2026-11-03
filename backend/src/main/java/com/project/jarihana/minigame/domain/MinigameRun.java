package com.project.jarihana.minigame.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.member.domain.Member;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 순위에 오르는 한 판이다. 막대 5개를 차례로 자르며, 막대는 seed로 다시 만들어 판정한다.
 * 막대를 내려준 시각부터 자른 시각까지를 걸린 시간으로 잰다.
 */
@Entity
@Table(name = "minigame_run")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MinigameRun extends BaseEntity {

    public static final Duration ROUND_TIME_LIMIT = Duration.ofSeconds(30);
    public static final Duration SUBMIT_GRACE = Duration.ofSeconds(3);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "event", nullable = false, length = 40)
    private MinigameEvent event;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    private Member member;

    @Column(name = "seed", nullable = false)
    private long seed;

    @Column(name = "played_on", nullable = false)
    private LocalDate playedOn;

    @Column(name = "cut_rounds", nullable = false)
    private int cutRounds;

    @Column(name = "total_score", nullable = false)
    private int totalScore;

    @Column(name = "total_duration_millis", nullable = false)
    private long totalDurationMillis;

    @Column(name = "round_issued_at", nullable = false)
    private LocalDateTime roundIssuedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    private MinigameRun(
            Long id,
            MinigameEvent event,
            Member member,
            long seed,
            LocalDate playedOn,
            int cutRounds,
            int totalScore,
            long totalDurationMillis,
            LocalDateTime roundIssuedAt,
            LocalDateTime finishedAt,
            LocalDateTime createdAt
    ) {
        super(require(createdAt, "판 시작 시각은 필수입니다."));
        this.id = id;
        this.event = require(event, "이벤트는 필수입니다.");
        this.member = require(member, "회원은 필수입니다.");
        this.seed = seed;
        this.playedOn = require(playedOn, "도전한 날짜는 필수입니다.");
        this.cutRounds = cutRounds;
        this.totalScore = totalScore;
        this.totalDurationMillis = totalDurationMillis;
        this.roundIssuedAt = require(roundIssuedAt, "막대를 내려준 시각은 필수입니다.");
        this.finishedAt = finishedAt;
    }

    public static MinigameRun start(MinigameEvent event, Member member, long seed, LocalDateTime now) {
        return new MinigameRun(null, event, member, seed, require(now, "판 시작 시각은 필수입니다.").toLocalDate(),
                0, 0, 0, now, null, now);
    }

    public int currentRound() {
        return cutRounds + 1;
    }

    public boolean finished() {
        return finishedAt != null;
    }

    public StickPuzzle currentPuzzle() {
        return StickPuzzleGenerator.generate(seed, currentRound());
    }

    /**
     * 지금 차례의 막대를 자른다. 기존 판은 바꾸지 않고 다음 막대로 넘어간 새 판을 결과에 담는다.
     */
    public RoundCut cut(int round, double position, LocalDateTime now) {
        if (finished() || round != currentRound()) {
            throw new BusinessException(ErrorCode.MINIGAME_ROUND_CONFLICT, "지금 자를 수 있는 막대가 아닙니다.");
        }
        CutJudgement judgement = currentPuzzle().judge(position);
        long durationMillis = Math.max(0, Duration.between(roundIssuedAt, now).toMillis());
        boolean timedOut = durationMillis > ROUND_TIME_LIMIT.plus(SUBMIT_GRACE).toMillis();
        int score = timedOut ? 0 : judgement.score();
        int nextCutRounds = cutRounds + 1;
        LocalDateTime nextFinishedAt = nextCutRounds >= StickPuzzleGenerator.ROUNDS ? now : null;
        MinigameRun next = new MinigameRun(id, event, member, seed, playedOn, nextCutRounds, totalScore + score,
                totalDurationMillis + durationMillis, now, nextFinishedAt, getCreatedAt());
        return new RoundCut(next, round, position, judgement, durationMillis, timedOut);
    }

    private static <T> T require(T value, String message) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, message);
        }
        return value;
    }

    public Long getId() {
        return id;
    }

    public MinigameEvent getEvent() {
        return event;
    }

    public Member getMember() {
        return member;
    }

    public long getSeed() {
        return seed;
    }

    public LocalDate getPlayedOn() {
        return playedOn;
    }

    public int getCutRounds() {
        return cutRounds;
    }

    public int getTotalScore() {
        return totalScore;
    }

    public long getTotalDurationMillis() {
        return totalDurationMillis;
    }

    public LocalDateTime getRoundIssuedAt() {
        return roundIssuedAt;
    }

    public LocalDateTime getFinishedAt() {
        return finishedAt;
    }
}

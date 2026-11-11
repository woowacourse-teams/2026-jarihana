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
 * 막대를 내려준 시각부터 자른 시각까지를 걸린 시간으로 잰다. 1번 막대는 판을 시작할 때 내려주고,
 * 2번부터는 결과를 본 회원이 다음 막대를 받을 때 내려준다. 받기 전에는 {@code roundIssuedAt}이 비어 있다.
 * 판은 시작 후 {@link #RUN_TIME_LIMIT} 안에만 다음 막대를 받을 수 있고, 그 뒤로는 이미 받은 막대의 제한 시간 안에서만
 * 자를 수 있다. 그래서 끝난 판은 늦어도 시작 후 10분 13초(판 기한 10분, 막대 제한 시간 10초, 여유 3초) 안에 끝나고, 이벤트 순위는 마감 뒤 그 안에 확정된다.
 */
@Entity
@Table(name = "minigame_run")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MinigameRun extends BaseEntity {

    public static final Duration ROUND_TIME_LIMIT = Duration.ofSeconds(10);
    public static final Duration SUBMIT_GRACE = Duration.ofSeconds(3);
    public static final Duration RUN_TIME_LIMIT = Duration.ofMinutes(10);

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

    @Column(name = "round_issued_at")
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
        this.roundIssuedAt = roundIssuedAt;
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

    public boolean roundIssued() {
        return roundIssuedAt != null;
    }

    /**
     * 지금 차례의 막대를 내려주고 제한 시간을 그때부터 잰다. 이미 내려준 막대를 다시 요청하면 처음 내려준 시각을 그대로 둔다.
     */
    public MinigameRun issueRound(int round, LocalDateTime now) {
        requireCurrentRound(round, "지금 받을 수 있는 막대가 아닙니다.");
        if (roundIssued()) {
            return this;
        }
        if (now.isAfter(issueDeadline())) {
            throw new BusinessException(ErrorCode.MINIGAME_RUN_EXPIRED, "제한 시간이 지나 끝난 판입니다.");
        }
        return new MinigameRun(id, event, member, seed, playedOn, cutRounds, totalScore, totalDurationMillis,
                now, null, getCreatedAt());
    }

    /**
     * 지금 차례의 막대를 자른다. 기존 판은 바꾸지 않고 다음 막대로 넘어간 새 판을 결과에 담는다.
     * 다음 막대는 아직 내려주지 않은 상태로 둔다.
     */
    public RoundCut cut(int round, double position, LocalDateTime now) {
        requireCurrentRound(round, "지금 자를 수 있는 막대가 아닙니다.");
        if (!roundIssued()) {
            throw new BusinessException(ErrorCode.MINIGAME_ROUND_CONFLICT, "아직 받지 않은 막대입니다.");
        }
        if (now.isAfter(cutDeadline())) {
            throw new BusinessException(ErrorCode.MINIGAME_RUN_EXPIRED, "제한 시간이 지나 끝난 판입니다.");
        }
        CutJudgement judgement = currentPuzzle().judge(position);
        long durationMillis = Math.max(0, Duration.between(roundIssuedAt, now).toMillis());
        boolean timedOut = durationMillis > ROUND_TIME_LIMIT.plus(SUBMIT_GRACE).toMillis();
        int score = timedOut ? 0 : judgement.score();
        int nextCutRounds = cutRounds + 1;
        LocalDateTime nextFinishedAt = nextCutRounds >= StickPuzzleGenerator.ROUNDS ? now : null;
        MinigameRun next = new MinigameRun(id, event, member, seed, playedOn, nextCutRounds, totalScore + score,
                totalDurationMillis + durationMillis, null, nextFinishedAt, getCreatedAt());
        return new RoundCut(next, round, position, judgement, durationMillis, timedOut);
    }

    /**
     * 지금 막대의 제한 시간이 끝나는 시각이다. 여유 시간은 화면에 보여 주지 않는다.
     */
    public LocalDateTime roundEndsAt() {
        if (!roundIssued()) {
            throw new BusinessException(ErrorCode.MINIGAME_ROUND_CONFLICT, "아직 받지 않은 막대입니다.");
        }
        return roundIssuedAt.plus(ROUND_TIME_LIMIT);
    }

    // 다음 막대는 판을 시작하고 10분 안에만 받을 수 있다.
    private LocalDateTime issueDeadline() {
        return getCreatedAt().plus(RUN_TIME_LIMIT);
    }

    // 받은 막대는 판의 기한이 지나도 그 막대의 제한 시간과 여유 시간까지는 자를 수 있다.
    // 판의 기한 전이라면 늦게 잘라도 받아서 0점으로 기록한다.
    private LocalDateTime cutDeadline() {
        LocalDateTime roundDeadline = roundIssuedAt.plus(ROUND_TIME_LIMIT).plus(SUBMIT_GRACE);
        LocalDateTime runDeadline = issueDeadline();
        return roundDeadline.isAfter(runDeadline) ? roundDeadline : runDeadline;
    }

    private void requireCurrentRound(int round, String message) {
        if (finished() || round != currentRound()) {
            throw new BusinessException(ErrorCode.MINIGAME_ROUND_CONFLICT, message);
        }
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

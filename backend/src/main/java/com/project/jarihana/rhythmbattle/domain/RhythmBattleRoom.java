package com.project.jarihana.rhythmbattle.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 행성이의 리듬 작살 1:1 대전 방이다. 방장이 난이도를 정하고, 두 사람이 준비하면 방장이 시작한다.
 *
 * <p>시작하면 서버가 시드와 공통 시작 시각을 정하고 두 사람은 그 시각에 같은 채보를 친다. 판의 진행은
 * {@link RhythmBattleRun}이 사람마다 따로 가지며, 방은 판의 번호와 결과, 실시간 알림에 쓰는 revision을 가진다.
 */
@Getter
@Entity
@Table(name = "rhythm_battle_room")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RhythmBattleRoom extends BaseEntity {
    // 시작을 누른 뒤 두 사람이 실시간 알림을 받고 음악을 맞춰 틀 시간이다.
    public static final Duration COUNTDOWN = Duration.ofSeconds(5);
    static final Duration IDLE_LIMIT = Duration.ofMinutes(30);

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private long hostMemberId;

    @Column(length = 50)
    private String hostName;

    private Long guestMemberId;

    @Column(length = 50)
    private String guestName;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private BattleVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private RhythmLevel level;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private BattleRoomStatus status;

    private boolean hostReady;

    private boolean guestReady;

    private double hostScrollSpeed;

    private double guestScrollSpeed;

    private int gameNumber;

    private int seed;

    private LocalDateTime startsAt;

    private Long winnerMemberId;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private BattleEndReason endReason;

    private long revision;

    private LocalDateTime touchedAt;

    @Column(length = 64)
    private String inviteHash;

    private RhythmBattleRoom(long hostId, String hostName, BattleVisibility visibility, RhythmLevel level,
            LocalDateTime now) {
        super(now);
        this.hostMemberId = hostId;
        this.hostName = Objects.requireNonNull(hostName);
        this.visibility = Objects.requireNonNull(visibility);
        this.level = Objects.requireNonNull(level);
        status = BattleRoomStatus.WAITING;
        hostScrollSpeed = 1;
        guestScrollSpeed = 1;
        revision = 1;
        touchedAt = now;
    }

    private RhythmBattleRoom(RhythmBattleRoom previous, LocalDateTime now) {
        super(previous.getCreatedAt());
        id = previous.id;
        hostMemberId = previous.hostMemberId;
        hostName = previous.hostName;
        guestMemberId = previous.guestMemberId;
        guestName = previous.guestName;
        visibility = previous.visibility;
        level = previous.level;
        status = previous.status;
        hostReady = previous.hostReady;
        guestReady = previous.guestReady;
        hostScrollSpeed = previous.hostScrollSpeed;
        guestScrollSpeed = previous.guestScrollSpeed;
        gameNumber = previous.gameNumber;
        seed = previous.seed;
        startsAt = previous.startsAt;
        winnerMemberId = previous.winnerMemberId;
        endReason = previous.endReason;
        inviteHash = previous.inviteHash;
        revision = previous.revision + 1;
        touchedAt = now;
    }

    public static RhythmBattleRoom create(long hostId, String hostName, BattleVisibility visibility, RhythmLevel level,
            LocalDateTime now) {
        if (visibility == null || level == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "공개 여부와 난이도를 골라 주세요.");
        }
        return new RhythmBattleRoom(hostId, hostName, visibility, level, now);
    }

    public boolean contains(long memberId) {
        return hostMemberId == memberId || Objects.equals(guestMemberId, memberId);
    }

    public boolean isHost(long memberId) {
        return hostMemberId == memberId;
    }

    public void requireParticipant(long memberId) {
        if (!contains(memberId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "방에 참가한 회원만 사용할 수 있어요.");
        }
    }

    public long opponentOf(long memberId) {
        requireParticipant(memberId);
        require(guestMemberId != null, "상대가 아직 없어요.");
        return isHost(memberId) ? guestMemberId : hostMemberId;
    }

    public double scrollSpeedOf(long memberId) {
        requireParticipant(memberId);
        return isHost(memberId) ? hostScrollSpeed : guestScrollSpeed;
    }

    public RhythmBattleRoom join(long memberId, String name, LocalDateTime now) {
        require(status == BattleRoomStatus.WAITING, "참가할 수 없는 방이에요.");
        if (contains(memberId)) {
            return this;
        }
        require(guestMemberId == null, "참가할 수 없는 방이에요.");
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        next.guestMemberId = memberId;
        next.guestName = Objects.requireNonNull(name);
        next.hostReady = false;
        next.guestReady = false;
        return next;
    }

    /**
     * 준비 상태를 바꾼다. 준비할 때 고른 세균 이동 배속으로 다음 판을 친다. 보이는 속도만 바뀌고 판정에는 영향이 없다.
     */
    public RhythmBattleRoom ready(long memberId, boolean value, double scrollSpeed, LocalDateTime now) {
        requireParticipant(memberId);
        require(status == BattleRoomStatus.WAITING || status == BattleRoomStatus.FINISHED,
                "지금은 준비 상태를 바꿀 수 없어요.");
        require(guestMemberId != null, "상대가 입장한 후 준비해 주세요.");
        double speed = validScrollSpeed(scrollSpeed);
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        if (isHost(memberId)) {
            next.hostReady = value;
            next.hostScrollSpeed = speed;
        } else {
            next.guestReady = value;
            next.guestScrollSpeed = speed;
        }
        return next;
    }

    private static double validScrollSpeed(double scrollSpeed) {
        if (!Double.isFinite(scrollSpeed) || scrollSpeed < 1 || scrollSpeed > 3
                || scrollSpeed * 4 != Math.rint(scrollSpeed * 4)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세균 이동 배속은 1.0부터 3.0까지 0.25 단위로 골라 주세요.");
        }
        return scrollSpeed;
    }

    public RhythmBattleRoom start(long memberId, int seed, LocalDateTime now) {
        requireParticipant(memberId);
        if (!isHost(memberId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "방장만 대전을 시작할 수 있어요.");
        }
        require(status == BattleRoomStatus.WAITING || status == BattleRoomStatus.FINISHED,
                "지금은 대전을 시작할 수 없어요.");
        require(guestMemberId != null && hostReady && guestReady, "두 사람 모두 준비해야 시작할 수 있어요.");
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        next.status = BattleRoomStatus.PLAYING;
        next.gameNumber = gameNumber + 1;
        next.seed = seed;
        next.startsAt = now.plus(COUNTDOWN);
        next.winnerMemberId = null;
        next.endReason = null;
        next.hostReady = false;
        next.guestReady = false;
        return next;
    }

    /**
     * 진행 중인 판에서 누군가의 입력이 계산되었다. 실시간 연결이 상대 진행을 다시 보내도록 revision만 올린다.
     */
    public RhythmBattleRoom progressed(LocalDateTime now) {
        require(status == BattleRoomStatus.PLAYING, "진행 중인 대전이 아니에요.");
        return new RhythmBattleRoom(this, now);
    }

    public RhythmBattleRoom finish(BattleOutcome outcome, LocalDateTime now) {
        require(status == BattleRoomStatus.PLAYING, "진행 중인 대전이 아니에요.");
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        next.status = BattleRoomStatus.FINISHED;
        next.winnerMemberId = outcome.winnerMemberId();
        next.endReason = outcome.reason();
        next.startsAt = null;
        next.hostReady = false;
        next.guestReady = false;
        return next;
    }

    /**
     * 대기 중 상대가 나가면 자리를 비운다. 방장이 나가거나 결과 화면에서 누가 나가면 방을 닫는다.
     * 진행 중에 나가는 경우는 먼저 기권으로 판을 끝낸 뒤 호출한다.
     */
    public RhythmBattleRoom leave(long memberId, LocalDateTime now) {
        requireParticipant(memberId);
        if (status == BattleRoomStatus.CLOSED) {
            return this;
        }
        require(status != BattleRoomStatus.PLAYING, "진행 중인 판을 먼저 끝내 주세요.");
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        if (status == BattleRoomStatus.WAITING && !isHost(memberId)) {
            next.guestMemberId = null;
            next.guestName = null;
            next.hostReady = false;
            next.guestReady = false;
            next.guestScrollSpeed = 1;
            return next;
        }
        next.status = BattleRoomStatus.CLOSED;
        return next;
    }

    public RhythmBattleRoom expire(LocalDateTime now) {
        if ((status == BattleRoomStatus.WAITING || status == BattleRoomStatus.FINISHED)
                && !now.isBefore(touchedAt.plus(IDLE_LIMIT))) {
            RhythmBattleRoom next = new RhythmBattleRoom(this, now);
            next.status = BattleRoomStatus.CLOSED;
            return next;
        }
        return this;
    }

    public RhythmBattleRoom invite(long memberId, String hash, LocalDateTime now) {
        requireParticipant(memberId);
        require(status == BattleRoomStatus.WAITING, "대기 중인 방에서 초대할 수 있어요.");
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        next.inviteHash = hash;
        return next;
    }

    /**
     * 채팅은 방의 마지막 활동 시각만 갱신하고 판 revision은 그대로 둔다.
     */
    public RhythmBattleRoom chatActivity(LocalDateTime now) {
        RhythmBattleRoom next = new RhythmBattleRoom(this, now);
        next.revision = revision;
        return next;
    }

    private static void require(boolean valid, String message) {
        if (!valid) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_CONFLICT, message);
        }
    }

    @Override
    public boolean equals(Object value) {
        if (this == value) {
            return true;
        }
        return value instanceof RhythmBattleRoom other && id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}

package com.project.jarihana.gomoku.domain;

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

import java.time.LocalDateTime;
import java.util.Objects;

@Getter
@Entity
@Table(name = "gomoku_room")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GomokuRoom extends BaseEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private long hostMemberId;

    @Column(nullable = false, length = 50)
    private String hostName;

    private Long guestMemberId;

    @Column(length = 50)
    private String guestName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RoomVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private GomokuRule rule;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RoomStatus status;

    @Column(nullable = false)
    private boolean hostReady;

    @Column(nullable = false)
    private boolean guestReady;

    @Column(nullable = false)
    private int gameNumber;

    @Column(nullable = false)
    private long blackMemberId;

    @Column(nullable = false, length = 225)
    private String board;

    @Column(nullable = false)
    private int ply;

    @Column(name = "last_x")
    private Integer lastX;

    @Column(name = "last_y")
    private Integer lastY;

    private Long winnerMemberId;

    @Column(length = 16)
    private String endReason;

    private LocalDateTime turnDeadline;

    @Column(nullable = false)
    private long revision;

    @Column(nullable = false)
    private LocalDateTime touchedAt;

    @Column(length = 64)
    private String inviteHash;

    private GomokuRoom(
            long hostId,
            String hostName,
            RoomVisibility visibility,
            GomokuRule rule,
            LocalDateTime now) {
        super(now);
        this.hostMemberId = hostId;
        this.hostName = Objects.requireNonNull(hostName);
        this.visibility = Objects.requireNonNull(visibility);
        this.rule = Objects.requireNonNull(rule);
        status = RoomStatus.WAITING;
        board = GomokuBoard.empty().encoded();
        revision = 1;
        touchedAt = now;
    }

    private GomokuRoom(GomokuRoom previous, LocalDateTime now) {
        super(previous.getCreatedAt());
        id = previous.id;
        hostMemberId = previous.hostMemberId;
        hostName = previous.hostName;
        guestMemberId = previous.guestMemberId;
        guestName = previous.guestName;
        visibility = previous.visibility;
        rule = previous.rule;
        status = previous.status;
        hostReady = previous.hostReady;
        guestReady = previous.guestReady;
        gameNumber = previous.gameNumber;
        blackMemberId = previous.blackMemberId;
        board = previous.board;
        ply = previous.ply;
        lastX = previous.lastX;
        lastY = previous.lastY;
        winnerMemberId = previous.winnerMemberId;
        endReason = previous.endReason;
        turnDeadline = previous.turnDeadline;
        inviteHash = previous.inviteHash;
        revision = previous.revision + 1;
        touchedAt = now;
    }

    public static GomokuRoom create(
            long hostId,
            String name,
            RoomVisibility visibility,
            GomokuRule rule,
            LocalDateTime now) {
        return new GomokuRoom(hostId, name, visibility, rule, now);
    }

    public boolean contains(long memberId) {
        return hostMemberId == memberId || Objects.equals(guestMemberId, memberId);
    }

    public void requireParticipant(long memberId) {
        if (!contains(memberId))
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "방에 참가한 회원만 사용할 수 있어요.");
    }

    public GomokuRoom join(long memberId, String name, LocalDateTime now) {
        require(status == RoomStatus.WAITING, "참가할 수 없는 방이에요.");
        if (contains(memberId)) return this;
        require(status == RoomStatus.WAITING && guestMemberId == null, "참가할 수 없는 방이에요.");
        GomokuRoom next = new GomokuRoom(this, now);
        next.guestMemberId = memberId;
        next.guestName = name;
        next.hostReady = false;
        next.guestReady = false;
        return next;
    }

    public GomokuRoom ready(long memberId, boolean value, LocalDateTime now) {
        requireParticipant(memberId);
        require(
                status == RoomStatus.WAITING || status == RoomStatus.FINISHED,
                "지금은 준비 상태를 바꿀 수 없어요.");
        require(guestMemberId != null, "상대가 입장한 후 준비해 주세요.");
        if ((hostMemberId == memberId ? hostReady : guestReady) == value) return this;
        GomokuRoom next = new GomokuRoom(this, now);
        if (hostMemberId == memberId) next.hostReady = value;
        else next.guestReady = value;
        return next;
    }

    public GomokuRoom start(long memberId, long firstBlackId, LocalDateTime now) {
        requireParticipant(memberId);
        if (hostMemberId != memberId) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "방장만 대국을 시작할 수 있어요.");
        }
        require(
                status == RoomStatus.WAITING || status == RoomStatus.FINISHED,
                "지금은 대국을 시작할 수 없어요.");
        require(guestMemberId != null && hostReady && guestReady, "두 사람 모두 준비해야 시작할 수 있어요.");
        require(
                gameNumber > 0
                        || firstBlackId == hostMemberId
                        || Objects.equals(guestMemberId, firstBlackId),
                "흑돌 참가자 정보가 올바르지 않아요.");
        GomokuRoom next = new GomokuRoom(this, now);
        next.blackMemberId = gameNumber == 0 ? firstBlackId : opponent(blackMemberId);
        next.gameNumber = gameNumber + 1;
        next.board = GomokuBoard.empty().encoded();
        next.ply = 0;
        next.lastX = null;
        next.lastY = null;
        next.winnerMemberId = null;
        next.endReason = null;
        next.turnDeadline = now.plusSeconds(60);
        next.status = RoomStatus.PLAYING;
        next.hostReady = false;
        next.guestReady = false;
        return next;
    }

    public long turnMemberId() {
        return ply % 2 == 0 ? blackMemberId : opponent(blackMemberId);
    }

    public Stone turnStone() {
        return ply % 2 == 0 ? Stone.BLACK : Stone.WHITE;
    }

    private long opponent(long memberId) {
        return memberId == hostMemberId ? guestMemberId : hostMemberId;
    }

    public GomokuRoom move(
            long memberId, int game, int expectedPly, int x, int y, LocalDateTime now) {
        requireParticipant(memberId);
        require(
                status == RoomStatus.PLAYING && gameNumber == game && ply == expectedPly,
                "판이 바뀌었어요. 최신 상태를 확인해 주세요.");
        require(now.isBefore(turnDeadline), "제한 시간이 끝났어요.");
        require(turnMemberId() == memberId, "내 차례에 돌을 놓아 주세요.");
        GomokuBoard.Placement placement = GomokuBoard.from(board).place(x, y, turnStone(), rule);
        GomokuRoom next = new GomokuRoom(this, now);
        next.board = placement.board().encoded();
        next.ply = ply + 1;
        next.lastX = x;
        next.lastY = y;
        next.turnDeadline = now.plusSeconds(60);
        if (placement.won() || placement.full()) {
            next.status = RoomStatus.FINISHED;
            next.turnDeadline = null;
            next.winnerMemberId = placement.won() ? memberId : null;
            next.endReason = placement.won() ? "FIVE" : "DRAW";
        }
        return next;
    }

    public GomokuRoom resign(long memberId, LocalDateTime now) {
        requireParticipant(memberId);
        require(status == RoomStatus.PLAYING, "진행 중인 판이 없어요.");
        GomokuRoom next = new GomokuRoom(this, now);
        next.status = RoomStatus.FINISHED;
        next.winnerMemberId = opponent(memberId);
        next.endReason = "RESIGN";
        next.turnDeadline = null;
        next.hostReady = false;
        next.guestReady = false;
        return next;
    }

    public GomokuRoom leave(long memberId, LocalDateTime now) {
        requireParticipant(memberId);
        if (status == RoomStatus.CLOSED) return this;
        GomokuRoom next =
                status == RoomStatus.PLAYING ? resign(memberId, now) : new GomokuRoom(this, now);
        if (status == RoomStatus.WAITING && memberId != hostMemberId) {
            next.guestMemberId = null;
            next.guestName = null;
            next.hostReady = false;
            next.guestReady = false;
        } else next.status = RoomStatus.CLOSED;
        return next;
    }

    public GomokuRoom expire(LocalDateTime now) {
        if (status == RoomStatus.PLAYING && !now.isBefore(turnDeadline)) {
            GomokuRoom next = new GomokuRoom(this, now);
            next.status = RoomStatus.FINISHED;
            next.winnerMemberId = opponent(turnMemberId());
            next.endReason = "TIMEOUT";
            next.turnDeadline = null;
            next.hostReady = false;
            next.guestReady = false;
            return next;
        }
        if ((status == RoomStatus.WAITING || status == RoomStatus.FINISHED)
                && !now.isBefore(touchedAt.plusMinutes(30))) {
            GomokuRoom next = new GomokuRoom(this, now);
            next.status = RoomStatus.CLOSED;
            return next;
        }
        return this;
    }

    public GomokuRoom invite(long memberId, String hash, LocalDateTime now) {
        requireParticipant(memberId);
        require(status == RoomStatus.WAITING, "대기 중인 방에서 초대할 수 있어요.");
        GomokuRoom next = new GomokuRoom(this, now);
        next.inviteHash = hash;
        return next;
    }

    private static void require(boolean valid, String message) {
        if (!valid) throw new BusinessException(ErrorCode.GOMOKU_CONFLICT, message);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public boolean equals(Object value) {
        if (this == value) return true;
        return value instanceof GomokuRoom other && id != null && id.equals(other.id);
    }
}

package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.command.repository.GomokuMoveRepository;
import com.project.jarihana.gomoku.command.repository.GomokuRoomRepository;
import com.project.jarihana.gomoku.command.repository.GomokuSeatRepository;
import com.project.jarihana.gomoku.command.service.dto.GomokuMoveCommand;
import com.project.jarihana.gomoku.domain.GomokuMove;
import com.project.jarihana.gomoku.domain.GomokuRoom;
import com.project.jarihana.gomoku.domain.GomokuRule;
import com.project.jarihana.gomoku.domain.GomokuSeat;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.member.domain.Member;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Transactional(noRollbackFor = GomokuRoomExpiredException.class)
public class GomokuCommandService {
    private final GomokuRoomRepository rooms;
    private final GomokuSeatRepository seats;
    private final GomokuMoveRepository moves;
    private final MemberRepository members;
    private final GomokuTokens tokens;
    private final GomokuHistoryRecorder history;
    private final GomokuChatLifecycle chat;
    private final Clock clock;

    public long create(long memberId, RoomVisibility visibility, GomokuRule rule) {
        Member host = lockMember(memberId);
        requireFree(memberId);
        GomokuRoom saved =
                rooms.saveAndFlush(
                        GomokuRoom.create(memberId, host.getCrewName(), visibility, rule, now()));
        chat.create(saved.getId());
        seats.saveAndFlush(GomokuSeat.claim(memberId, saved.getId()));
        return saved.getId();
    }

    public long join(long id, long memberId, String token) {
        Member member = lockMember(memberId);
        GomokuRoom room = current(id, memberId, false);
        if (room.contains(memberId) && room.getStatus() != RoomStatus.CLOSED) return id;
        requireFree(memberId);
        if (room.getVisibility() == RoomVisibility.PRIVATE
                && !tokens.matches(token, room.getInviteHash())) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "초대 링크로 참가해 주세요.");
        }
        rooms.save(room.join(memberId, member.getCrewName(), now()));
        seats.saveAndFlush(GomokuSeat.claim(memberId, id, chat.latestSequence(id)));
        return id;
    }

    public long ready(long id, long memberId, boolean ready, int gameNumber) {
        GomokuRoom room = current(id, memberId, true);
        if (gameNumber != room.getGameNumber() + 1) throw conflict("이전 판의 준비 요청이에요.");
        rooms.save(room.ready(memberId, ready, now()));
        return id;
    }

    public long start(long id, long memberId, int gameNumber) {
        GomokuRoom room = current(id, memberId, true);
        if (gameNumber != room.getGameNumber() + 1) throw conflict("이전 판의 시작 요청이에요.");
        long black =
                ThreadLocalRandom.current().nextBoolean() || room.getGuestMemberId() == null
                        ? room.getHostMemberId()
                        : room.getGuestMemberId();
        LocalDateTime startedAt = now();
        GomokuRoom started = room.start(memberId, black, startedAt);
        rooms.save(started);
        history.start(started, startedAt);
        return id;
    }

    public long move(long id, long memberId, GomokuMoveCommand command) {
        GomokuRoom room = lock(id);
        room.requireParticipant(memberId);
        if (room.getGameNumber() != command.gameNumber()) throw conflict("이전 판의 착수 요청이에요.");
        var existing =
                moves.findByRoomIdAndGameNumberAndMemberIdAndRequestId(
                        id, command.gameNumber(), memberId, command.requestId());
        if (existing.isPresent()) {
            GomokuMove previous = existing.get();
            if (previous.getX() != command.x()
                    || previous.getY() != command.y()
                    || previous.getPly() != command.expectedPly() + 1) {
                throw conflict("같은 요청 번호로 다른 위치에 놓을 수 없어요.");
            }
            GomokuRoom expired = room.expire(now());
            if (expired != room) {
                history.finish(room, expired, now());
                rooms.saveAndFlush(expired);
                if (expired.getStatus() == RoomStatus.CLOSED) releaseRoom(id);
            }
            return id;
        }
        checkExpiration(room);
        GomokuRoom next =
                room.move(
                        memberId,
                        command.gameNumber(),
                        command.expectedPly(),
                        command.x(),
                        command.y(),
                        now());
        history.finish(room, next, now());
        rooms.save(next);
        moves.saveAndFlush(
                GomokuMove.placed(
                        id,
                        command.gameNumber(),
                        memberId,
                        next.getPly(),
                        command.x(),
                        command.y(),
                        command.requestId(),
                        now()));
        return id;
    }

    public long resign(long id, long memberId, int gameNumber) {
        GomokuRoom room = current(id, memberId, true);
        if (gameNumber != room.getGameNumber()) throw conflict("이전 판의 요청이에요.");
        GomokuRoom next = room.resign(memberId, now());
        history.finish(room, next, now());
        rooms.save(next);
        return id;
    }

    public long leave(long id, long memberId) {
        lockMember(memberId);
        GomokuRoom room = lock(id);
        room.requireParticipant(memberId);
        GomokuRoom next = room.expire(now()).leave(memberId, now());
        history.finish(room, next, now());
        rooms.saveAndFlush(next);
        if (next.getStatus() == RoomStatus.CLOSED) releaseRoom(id);
        else seats.deleteById(memberId);
        return id;
    }

    public String invite(long id, long memberId) {
        GomokuRoom room = current(id, memberId, true);
        String raw = tokens.issue();
        rooms.save(room.invite(memberId, tokens.hash(raw), now()));
        return raw;
    }

    public void expire(long id) {
        rooms.lockById(id)
                .ifPresent(
                        room -> {
                            GomokuRoom next = room.expire(now());
                            if (next != room) {
                                history.finish(room, next, now());
                                rooms.saveAndFlush(next);
                                if (next.getStatus() == RoomStatus.CLOSED) releaseRoom(id);
                            }
                        });
    }

    private GomokuRoom current(long id, long memberId, boolean participant) {
        GomokuRoom room = lock(id);
        if (participant) room.requireParticipant(memberId);
        checkExpiration(room);
        return room;
    }

    private void checkExpiration(GomokuRoom room) {
        GomokuRoom next = room.expire(now());
        if (next != room) {
            history.finish(room, next, now());
            rooms.saveAndFlush(next);
            if (next.getStatus() == RoomStatus.CLOSED) releaseRoom(room.getId());
            // Expiration is committed even though the rejected action receives a conflict response.
            throw new GomokuRoomExpiredException();
        }
    }

    private Member lockMember(long id) {
        return members.findWithLockById(id)
                .orElseThrow(
                        () -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 확인해 주세요."));
    }

    private void releaseRoom(long id) {
        seats.releaseRoom(id);
        chat.close(id);
    }

    private void requireFree(long id) {
        if (seats.existsById(id)) throw conflict("이미 참여한 오목방으로 돌아가 주세요.");
    }

    private GomokuRoom lock(long id) {
        return rooms.lockById(id)
                .orElseThrow(
                        () -> new BusinessException(ErrorCode.GOMOKU_NOT_FOUND, "오목방을 찾을 수 없어요."));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    private BusinessException conflict(String message) {
        return new BusinessException(ErrorCode.GOMOKU_CONFLICT, message);
    }
}

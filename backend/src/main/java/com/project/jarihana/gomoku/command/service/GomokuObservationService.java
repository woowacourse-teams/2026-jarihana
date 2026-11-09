package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.command.repository.GomokuObservationRepository;
import com.project.jarihana.gomoku.command.repository.GomokuObserverConnectionRepository;
import com.project.jarihana.gomoku.command.repository.GomokuRoomRepository;
import com.project.jarihana.gomoku.command.service.dto.GomokuObservationResult;
import com.project.jarihana.gomoku.domain.GomokuObservation;
import com.project.jarihana.gomoku.domain.GomokuObserverConnection;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.member.command.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class GomokuObservationService {
    private final GomokuRoomRepository rooms;
    private final GomokuObservationRepository observations;
    private final GomokuObserverConnectionRepository connections;
    private final GomokuChatLifecycle chat;
    private final MemberRepository members;
    private final Clock clock;

    public GomokuObservationResult enter(long roomId, long memberId, UUID requestId) {
        var room = rooms.lockById(roomId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GOMOKU_NOT_FOUND, "오목방을 찾을 수 없어요."));
        if (room.getVisibility() != RoomVisibility.PUBLIC)
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "공개방만 관전할 수 있어요.");
        if (members.findById(memberId).isEmpty())
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 확인해 주세요.");
        var previous = observations.findByRoomIdAndMemberIdAndRequestId(roomId, memberId, requestId);
        if (previous.isPresent()) {
            if (previous.get().getLeftAt() != null)
                throw new BusinessException(ErrorCode.GOMOKU_CONFLICT, "종료된 관전이에요. 새로 입장해 주세요.");
            return new GomokuObservationResult(previous.get(), false);
        }
        LocalDateTime now = LocalDateTime.now(clock);
        if (room.contains(memberId) || room.getStatus() != RoomStatus.PLAYING || room.expire(now) != room)
            throw new BusinessException(ErrorCode.GOMOKU_CONFLICT, "진행 중인 다른 사람의 공개방만 관전할 수 있어요.");
        return new GomokuObservationResult(observations.saveAndFlush(
                GomokuObservation.enter(roomId, memberId, requestId, chat.latestSequence(roomId), now)), true);
    }

    public void leave(long roomId, long memberId, UUID participationId) {
        rooms.lockById(roomId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GOMOKU_NOT_FOUND, "오목방을 찾을 수 없어요."));
        var observation = findOwned(roomId, memberId, participationId);
        observations.save(observation.leave(LocalDateTime.now(clock)));
        connections.removeObservation(observation.getId());
    }

    public UUID connect(long roomId, long memberId, UUID participationId) {
        var room = rooms.lockById(roomId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GOMOKU_NOT_FOUND, "오목방을 찾을 수 없어요."));
        if (room.getVisibility() != RoomVisibility.PUBLIC)
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "공개방만 관전할 수 있어요.");
        var observation = findOwned(roomId, memberId, participationId);
        if (observation.getLeftAt() != null)
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "종료된 관전이에요.");
        return connections.saveAndFlush(GomokuObserverConnection.open(observation.getId(), LocalDateTime.now(clock)))
                .getConnectionId();
    }

    public void renew(UUID connectionId) {
        if (connections.renew(connectionId, LocalDateTime.now(clock).plusSeconds(45)) == 0)
            throw new BusinessException(ErrorCode.GOMOKU_STREAM_BUSY, "관전 연결을 다시 열어 주세요.");
    }

    public void disconnect(UUID connectionId) {
        connections.removeConnection(connectionId);
    }

    public void removeExpiredConnections() {
        connections.removeExpired(LocalDateTime.now(clock));
    }

    private GomokuObservation findOwned(long roomId, long memberId, UUID participationId) {
        return observations.findByRoomIdAndMemberIdAndParticipationId(roomId, memberId, participationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "관전 권한이 없어요."));
    }
}

package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.command.repository.GomokuChatMessageRepository;
import com.project.jarihana.gomoku.command.repository.GomokuChatRoomRepository;
import com.project.jarihana.gomoku.command.repository.GomokuRoomRepository;
import com.project.jarihana.gomoku.command.repository.GomokuSeatRepository;
import com.project.jarihana.gomoku.command.repository.GomokuObservationRepository;
import com.project.jarihana.gomoku.domain.RoomVisibility;
import com.project.jarihana.gomoku.domain.GomokuSenderRole;
import com.project.jarihana.member.command.repository.MemberRepository;
import com.project.jarihana.gomoku.command.service.dto.SendGomokuChatResult;
import com.project.jarihana.gomoku.config.GomokuChatSettings;
import com.project.jarihana.gomoku.domain.GomokuChatMessage;
import com.project.jarihana.gomoku.domain.GomokuChatRoom;
import com.project.jarihana.gomoku.domain.RoomStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GomokuChatCommandService {
    private final GomokuChatSettings settings;
    private final GomokuRoomRepository rooms;
    private final GomokuSeatRepository seats;
    private final GomokuChatRoomRepository chatRooms;
    private final GomokuChatMessageRepository messages;
    private final GomokuChatLifecycle lifecycle;
    private final GomokuHistoryRecorder history;
    private final Clock clock;
    private final GomokuObservationRepository observations;
    private final MemberRepository members;

    @Transactional(noRollbackFor = GomokuRoomExpiredException.class)
    public SendGomokuChatResult send(long roomId, long memberId, UUID participationId,
            UUID clientMessageId, String content) {
        settings.requireEnabled();
        var room = rooms.lockById(roomId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GOMOKU_NOT_FOUND, "오목방을 찾을 수 없어요."));
        var seat = seats.findById(memberId).filter(value -> value.getRoomId() == roomId && room.contains(memberId));
        GomokuSenderRole role;
        String author;
        if (seat.isPresent()) {
            if (!seat.get().getParticipationId().equals(participationId))
                throw new BusinessException(ErrorCode.GOMOKU_CHAT_PARTICIPATION_CHANGED, "참가 상태가 바뀌었어요. 다시 입장해 주세요.");
            role = GomokuSenderRole.PARTICIPANT;
            author = memberId == room.getHostMemberId() ? room.getHostName() : room.getGuestName();
        } else {
            observations.findByRoomIdAndMemberIdAndParticipationId(roomId, memberId, participationId)
                    .filter(value -> value.getLeftAt() == null && room.getVisibility() == RoomVisibility.PUBLIC)
                    .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "입장한 회원만 대화할 수 있어요."));
            role = GomokuSenderRole.SPECTATOR;
            author = members.findById(memberId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "회원 정보를 확인해 주세요."))
                    .getCrewName();
        }
        LocalDateTime now = LocalDateTime.now(clock);
        var expired = room.expire(now);
        if (expired != room) {
            history.finish(room, expired, now);
            rooms.saveAndFlush(expired);
            if (expired.getStatus() == RoomStatus.CLOSED) {
                seats.releaseRoom(roomId);
                lifecycle.close(roomId);
            }
            throw new GomokuRoomExpiredException();
        }
        if (room.getStatus() == RoomStatus.CLOSED)
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "종료된 방에는 대화할 수 없어요.");
        var existing = messages.findByRoomIdAndParticipationIdAndClientMessageId(roomId, participationId, clientMessageId);
        if (existing.isPresent()) {
            if (!existing.get().getContent().equals(content))
                throw new BusinessException(ErrorCode.GOMOKU_CONFLICT, "같은 요청 번호로 다른 메시지를 보낼 수 없어요.");
            return new SendGomokuChatResult(existing.get(), false);
        }
        if (content == null || content.isBlank() || content.length() > 2000)
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "메시지는 공백을 제외한 내용이 있고 2,000자 이하여야 해요.");
        var chat = chatRooms.findById(roomId).orElseGet(() -> GomokuChatRoom.create(roomId)).nextMessage();
        chatRooms.saveAndFlush(chat);
        var message = messages.saveAndFlush(GomokuChatMessage.create(roomId, chat.getLastSequence(), memberId,
                participationId, clientMessageId, author, content, role, now));
        if (role == GomokuSenderRole.PARTICIPANT) rooms.save(room.chatActivity(now));
        return new SendGomokuChatResult(message, true);
    }
}

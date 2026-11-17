package com.project.jarihana.rhythmbattle.command.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleChatMessageRepository;
import com.project.jarihana.rhythmbattle.command.repository.RhythmBattleRoomRepository;
import com.project.jarihana.rhythmbattle.domain.BattleRoomStatus;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleChatMessage;
import com.project.jarihana.rhythmbattle.domain.RhythmBattleRoom;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RhythmBattleChatCommandService {
    private final RhythmBattleRoomRepository rooms;
    private final RhythmBattleChatMessageRepository chats;
    private final Clock clock;

    /**
     * 방 참가자의 채팅을 남긴다. 같은 메시지 번호로 다시 보내면 처음 남긴 메시지를 돌려준다.
     * 채팅은 방의 마지막 활동 시각만 갱신하고 판 revision은 그대로 둔다.
     */
    @Transactional
    public RhythmBattleChatMessage send(long roomId, long memberId, UUID clientMessageId, String body) {
        RhythmBattleRoom room = rooms.lockById(roomId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RHYTHM_BATTLE_NOT_FOUND, "대전 방을 찾을 수 없어요."));
        room.requireParticipant(memberId);
        if (room.getStatus() == BattleRoomStatus.CLOSED) {
            throw new BusinessException(ErrorCode.RHYTHM_BATTLE_CONFLICT, "닫힌 방에는 채팅을 보낼 수 없어요.");
        }
        var existing = chats.findByRoomIdAndMemberIdAndClientMessageId(roomId, memberId, clientMessageId);
        if (existing.isPresent()) {
            return existing.get();
        }
        LocalDateTime now = LocalDateTime.now(clock);
        String name = room.isHost(memberId) ? room.getHostName() : room.getGuestName();
        RhythmBattleChatMessage saved =
                chats.save(RhythmBattleChatMessage.of(roomId, memberId, name, body, clientMessageId, now));
        rooms.save(room.chatActivity(now));
        return saved;
    }
}

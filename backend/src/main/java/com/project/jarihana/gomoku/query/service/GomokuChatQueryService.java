package com.project.jarihana.gomoku.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.config.GomokuChatSettings;
import com.project.jarihana.gomoku.domain.RoomStatus;
import com.project.jarihana.gomoku.query.repository.GomokuChatQueryRepository;
import com.project.jarihana.gomoku.query.service.dto.GomokuChatHistoryResult;
import com.project.jarihana.gomoku.query.service.dto.GomokuChatMessageResult;
import com.project.jarihana.gomoku.query.service.dto.GomokuChatSignalResult;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GomokuChatQueryService {
    private final GomokuChatQueryRepository repository;
    private final GomokuChatSettings settings;
    private final Clock clock;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public GomokuChatHistoryResult history(long roomId, long memberId, UUID participationId,
            Long before, Long after, int size) {
        settings.requireEnabled();
        var access = repository.findAccess(roomId, memberId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "현재 방 참가자만 대화할 수 있어요."));
        if (access.getStatus() == RoomStatus.CLOSED)
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "종료된 방의 대화는 볼 수 없어요.");
        if (access.getStatus() != RoomStatus.PLAYING
                && !LocalDateTime.now(clock).isBefore(access.getTouchedAt().plusMinutes(30)))
            throw new BusinessException(ErrorCode.GOMOKU_CHAT_CLOSED, "방이 종료되었어요.");
        if (participationId != null && !participationId.equals(access.getParticipationId()))
            throw new BusinessException(ErrorCode.GOMOKU_CHAT_PARTICIPATION_CHANGED, "참가 상태가 바뀌었어요. 다시 입장해 주세요.");
        var page = PageRequest.of(0, size + 1);
        var rows = after == null
                ? repository.findBefore(roomId, access.getChatStartSequence(), before == null ? Long.MAX_VALUE : before, page)
                : repository.findAfter(roomId, access.getChatStartSequence(), after, page);
        boolean hasNext = rows.size() > size;
        var items = new ArrayList<>(rows.stream().limit(size).map(GomokuChatMessageResult::from).toList());
        if (after == null) Collections.reverse(items);
        Long cursor = hasNext ? (after == null ? items.getFirst().sequence() : items.getLast().sequence()) : null;
        return new GomokuChatHistoryResult(access.getParticipationId(), access.getLatestSequence(), items, cursor, hasNext);
    }

    public List<GomokuChatSignalResult> signals(long roomId) {
        if (!settings.enabled()) return List.of();
        return repository.findSignals(roomId).stream()
                .map(row -> new GomokuChatSignalResult(row.getMemberId(), row.getParticipationId(), row.getLatestSequence()))
                .toList();
    }
}

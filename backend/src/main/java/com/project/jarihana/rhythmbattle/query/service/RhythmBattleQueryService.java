package com.project.jarihana.rhythmbattle.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.rhythm.domain.RhythmChart;
import com.project.jarihana.rhythmbattle.command.service.RhythmBattleTokens;
import com.project.jarihana.rhythmbattle.query.repository.RhythmBattleQueryRepository;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRevisionProjection;
import com.project.jarihana.rhythmbattle.query.repository.dto.RhythmBattleRoomProjection;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleBatchResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleChatResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleInvitationResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleLobbyResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRevisionResult;
import com.project.jarihana.rhythmbattle.query.service.dto.RhythmBattleRoomResult;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RhythmBattleQueryService {
    // 대기 방이 닫히는 활동 없음 기준과 같다. 곧 닫힐 방은 대기실에 보이지 않게 한다.
    private static final Duration LOBBY_IDLE = Duration.ofMinutes(30);
    private static final int BATCH_PAGE = 500;
    private static final int CHAT_PAGE = 100;

    private final RhythmBattleQueryRepository repository;
    private final RhythmBattleTokens tokens;
    private final RhythmChart chart;
    private final Clock clock;

    /**
     * 방에 참가한 회원만 방의 현재 모습을 본다. 닫힌 방도 참가자는 마지막 결과를 볼 수 있다.
     */
    public RhythmBattleRoomResult getRoom(long id, long memberId) {
        RhythmBattleRoomResult room = loadSnapshot(id);
        if (!room.contains(memberId)) {
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "방에 참가한 회원만 볼 수 있어요.");
        }
        return room;
    }

    public RhythmBattleRoomResult loadSnapshot(long id) {
        RhythmBattleRoomProjection room = repository.findProjectedById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.RHYTHM_BATTLE_NOT_FOUND, "대전 방을 찾을 수 없어요."));
        return RhythmBattleRoomResult.of(room, chart.chartVersion(room.getLevel()),
                room.getGameNumber() == 0 ? List.of() : repository.findRuns(id, room.getGameNumber()), clock);
    }

    public Map<Long, RhythmBattleRevisionResult> findRevisions(Collection<Long> ids) {
        return repository.findRevisions(ids).stream().collect(Collectors.toMap(
                RhythmBattleRevisionProjection::getId,
                row -> new RhythmBattleRevisionResult(row.getRevision(), row.getLatestChatId())));
    }

    public RhythmBattleLobbyResult findLobby(String cursor, int size) {
        LocalDateTime before = LocalDateTime.of(9999, 12, 31, 23, 59, 59);
        long beforeId = Long.MAX_VALUE;
        if (cursor != null) {
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                        .split("\\|", -1);
                if (parts.length != 3 || !"L".equals(parts[0])) {
                    throw new IllegalArgumentException();
                }
                before = LocalDateTime.parse(parts[1]);
                beforeId = Long.parseLong(parts[2]);
            } catch (RuntimeException exception) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "목록 위치가 올바르지 않아요.");
            }
        }
        LocalDateTime idle = LocalDateTime.now(clock).minus(LOBBY_IDLE);
        List<RhythmBattleRoomProjection> rows =
                repository.findLobby(idle, before, beforeId, PageRequest.of(0, size + 1));
        boolean more = rows.size() > size;
        List<RhythmBattleRoomProjection> page = rows.subList(0, Math.min(size, rows.size()));
        String next = null;
        if (more) {
            RhythmBattleRoomProjection last = page.getLast();
            next = Base64.getUrlEncoder().withoutPadding().encodeToString(
                    ("L|" + last.getCreatedAt() + "|" + last.getId()).getBytes(StandardCharsets.UTF_8));
        }
        return new RhythmBattleLobbyResult(page.stream().map(RhythmBattleLobbyResult.Item::from).toList(), next, more);
    }

    public Optional<Long> findCurrentRoomId(long memberId) {
        return repository.findCurrentRoomId(memberId);
    }

    public RhythmBattleInvitationResult getInvitation(String token) {
        return repository.findProjectedByInviteHash(tokens.hash(token))
                .map(RhythmBattleInvitationResult::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.RHYTHM_BATTLE_NOT_FOUND, "초대 링크가 만료되었어요."));
    }

    /**
     * 참가자가 들어온 뒤의 채팅을 최근 100개까지 보여 준다. 방에서 나간 뒤에는 볼 수 없다.
     */
    public List<RhythmBattleChatResult> findChatHistory(long id, long memberId) {
        getRoom(id, memberId);
        long after = repository.findChatAfterId(memberId, id)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCESS_DENIED, "방에 참가한 회원만 볼 수 있어요."));
        List<RhythmBattleChatResult> messages = repository.findRecentChats(id, after, PageRequest.of(0, CHAT_PAGE)).stream()
                .map(RhythmBattleChatResult::from)
                .collect(Collectors.toCollection(ArrayList::new));
        Collections.reverse(messages);
        return messages;
    }

    public List<RhythmBattleChatResult> findChatsAfter(long roomId, long afterId) {
        return repository.findChatsAfter(roomId, afterId, PageRequest.of(0, CHAT_PAGE * 10)).stream()
                .map(RhythmBattleChatResult::from).toList();
    }

    public Optional<Long> findChatAfterId(long memberId, long roomId) {
        return repository.findChatAfterId(memberId, roomId);
    }

    public List<RhythmBattleBatchResult> findBatchesAfter(long roomId, int gameNumber, long afterId) {
        return repository.findBatchesAfter(roomId, gameNumber, afterId, PageRequest.of(0, BATCH_PAGE)).stream()
                .map(RhythmBattleBatchResult::from).toList();
    }
}

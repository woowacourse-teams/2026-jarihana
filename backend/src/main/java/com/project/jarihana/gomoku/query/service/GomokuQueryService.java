package com.project.jarihana.gomoku.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.gomoku.command.service.GomokuTokens;
import com.project.jarihana.gomoku.query.repository.GomokuQueryRepository;
import com.project.jarihana.gomoku.query.repository.dto.GomokuRoomProjection;
import com.project.jarihana.gomoku.query.service.dto.GomokuPageResult;
import com.project.jarihana.gomoku.query.service.dto.GomokuRoomResult;

import lombok.RequiredArgsConstructor;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class GomokuQueryService {
    private final GomokuQueryRepository repository;
    private final GomokuTokens tokens;
    private final Clock clock;

    public GomokuRoomResult loadSnapshot(long id) {
        return GomokuRoomResult.from(
                repository.findProjectedById(id).orElseThrow(this::missing), clock);
    }

    public GomokuRoomResult getRoom(long id, long memberId) {
        GomokuRoomResult room = loadSnapshot(id);
        if (!room.contains(memberId))
            throw new BusinessException(ErrorCode.ACCESS_DENIED, "방에 참가한 회원만 볼 수 있어요.");
        return room;
    }

    public GomokuRoomResult preview(String token) {
        return GomokuRoomResult.from(
                repository.findProjectedByInviteHash(tokens.hash(token)).orElseThrow(this::missing),
                clock);
    }

    public Long currentRoom(long memberId) {
        return repository.currentRoom(memberId).orElse(null);
    }

    public GomokuPageResult lobby(String cursor, int size, String keyword) {
        LocalDateTime before = LocalDateTime.of(9999, 12, 31, 23, 59, 59);
        long beforeId = Long.MAX_VALUE;
        if (cursor != null) {
            try {
                String[] parts =
                        new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                                .split("\\|", -1);
                if (parts.length != 2) throw new IllegalArgumentException();
                before = LocalDateTime.parse(parts[0]);
                beforeId = Long.parseLong(parts[1]);
                if (beforeId < 1) throw new IllegalArgumentException();
            } catch (RuntimeException exception) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "목록 위치가 올바르지 않아요.");
            }
        }
        var rows =
                repository.lobby(
                        LocalDateTime.now(clock).minusMinutes(30),
                        before,
                        beforeId,
                        keyword == null ? "" : keyword.strip(),
                        PageRequest.of(0, size + 1));
        boolean more = rows.size() > size;
        var page = rows.subList(0, Math.min(size, rows.size()));
        String next = null;
        if (more) {
            GomokuRoomProjection last = page.getLast();
            next =
                    Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString(
                                    (last.getCreatedAt() + "|" + last.getId())
                                            .getBytes(StandardCharsets.UTF_8));
        }
        return new GomokuPageResult(
                page.stream().map(row -> GomokuRoomResult.from(row, clock)).toList(), next, more);
    }

    private BusinessException missing() {
        return new BusinessException(ErrorCode.GOMOKU_NOT_FOUND, "오목방을 찾을 수 없어요.");
    }
}

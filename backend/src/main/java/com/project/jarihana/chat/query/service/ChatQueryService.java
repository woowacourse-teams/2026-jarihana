package com.project.jarihana.chat.query.service;

import com.project.jarihana.chat.query.repository.ChatQueryRepository;
import com.project.jarihana.chat.query.repository.dto.ChatMessageProjection;
import com.project.jarihana.chat.query.service.dto.ChatHistoryResult;
import com.project.jarihana.chat.query.service.dto.ChatMessageResult;
import com.project.jarihana.chat.query.service.dto.ChatRoomResult;
import com.project.jarihana.chat.query.service.dto.ChatRoomsResult;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.image.query.service.ImageAccessService;

import io.micrometer.core.instrument.MeterRegistry;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;

@Service
@RequiredArgsConstructor
public class ChatQueryService {
    private final ChatQueryRepository repository;
    private final MeterRegistry metrics;
    private final ImageAccessService imageAccessService;

    // Authorization, latest sequence and returned messages must describe one committed snapshot.
    @Transactional(isolation = Isolation.REPEATABLE_READ, timeout = 10)
    public ChatHistoryResult history(
            long memberId, long groupId, Long before, Long after, int size) {
        validateSize(size);
        if ((before != null && after != null)
                || (before != null && before < 0)
                || (after != null && after < 0))
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "이력 커서를 확인해 주세요.");
        var room = repository.getRoom(memberId, groupId);
        var fetched = repository.messages(groupId, before, after, size + 1);
        boolean more = fetched.size() > size;
        var items = new ArrayList<>(fetched.subList(0, Math.min(size, fetched.size())));
        String next = more ? Long.toString(items.getLast().sequence()) : null;
        items.sort(Comparator.comparingLong(ChatMessageProjection::sequence));
        if (after != null) {
            metrics.counter("chat.catchup.requests").increment();
            metrics.counter("chat.catchup.messages").increment(items.size());
        }
        return new ChatHistoryResult(
                items.stream().map(ChatMessageResult::from).toList(),
                next,
                more,
                room.latestSequence(),
                room.lastReadSequence(),
                room.status());
    }

    public ChatRoomsResult rooms(long memberId, String cursor, int size, String query) {
        validateSize(size);
        LocalDateTime time = null;
        Long id = null;
        if (cursor != null && !cursor.isBlank()) {
            try {
                String[] parts =
                        new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8)
                                .split("\\|");
                time = LocalDateTime.parse(parts[0]);
                id = Long.parseLong(parts[1]);
                if (parts.length != 2 || id <= 0) throw new IllegalArgumentException();
            } catch (RuntimeException invalid) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "목록 커서를 확인해 주세요.");
            }
        }
        var fetched =
                repository.rooms(memberId, time, id, query == null ? "" : query, size + 1, null);
        boolean more = fetched.size() > size;
        var items = fetched.subList(0, Math.min(size, fetched.size()));
        String next =
                more
                        ? Base64.getUrlEncoder()
                                .withoutPadding()
                                .encodeToString(
                                        (items.getLast().createdAt()
                                                        + "|"
                                                        + items.getLast().groupId())
                                                .getBytes(StandardCharsets.UTF_8))
                        : null;
        return new ChatRoomsResult(
                items.stream()
                        .map(
                                room ->
                                        ChatRoomResult.from(
                                                room,
                                                imageAccessService.publicUrl(
                                                        room.representativeImageKey())))
                        .toList(),
                next,
                more);
    }

    private void validateSize(int size) {
        if (size < 1 || size > 100)
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "조회 개수는 1~100이어야 합니다.");
    }
}

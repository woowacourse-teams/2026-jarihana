package com.project.jarihana.chat.query.repository;

import com.project.jarihana.chat.domain.ChatMessage;
import com.project.jarihana.chat.query.repository.dto.ChatRoomProjection;

import java.time.LocalDateTime;
import java.util.List;

public interface ChatQueryRepository {
    ChatRoomProjection getRoom(long memberId, long groupId);

    List<ChatRoomProjection> rooms(
            long memberId,
            LocalDateTime cursorTime,
            Long cursorId,
            String query,
            int size,
            Long groupId);

    List<ChatMessage> messages(long groupId, Long before, Long after, int size);

    ChatMessage findMessage(long id);

    List<Long> members(long groupId);
}

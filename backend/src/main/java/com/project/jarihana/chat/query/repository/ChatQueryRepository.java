package com.project.jarihana.chat.query.repository;

import com.project.jarihana.chat.query.repository.dto.ChatMessageProjection;
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

    List<ChatMessageProjection> messages(long groupId, Long before, Long after, int size);

    ChatMessageProjection findMessage(long id);

    List<Long> members(long groupId);
}

package com.project.jarihana.chat.query.controller.dto;

import com.project.jarihana.chat.command.controller.dto.ChatMessageResponse;
import com.project.jarihana.chat.query.service.dto.ChatRoomResult;
import com.project.jarihana.chat.query.service.dto.ChatRoomsResult;

import java.time.LocalDateTime;
import java.util.List;

public record ChatRoomsResponse(List<RoomResponse> items, String nextCursor, boolean hasNext) {
    public static ChatRoomsResponse from(ChatRoomsResult r) {
        return new ChatRoomsResponse(
                r.items().stream().map(RoomResponse::from).toList(), r.nextCursor(), r.hasNext());
    }

    public record RoomResponse(
            String groupId,
            String name,
            String type,
            String description,
            String representativeImageUrl,
            long memberCount,
            String status,
            String latestSequence,
            String lastReadSequence,
            long unreadCount,
            ChatMessageResponse lastMessage,
            LocalDateTime updatedAt) {
        static RoomResponse from(ChatRoomResult r) {
            return new RoomResponse(
                    Long.toString(r.groupId()),
                    r.name(),
                    r.type(),
                    r.description(),
                    r.representativeImageUrl(),
                    r.memberCount(),
                    r.status(),
                    Long.toString(r.latestSequence()),
                    Long.toString(r.lastReadSequence()),
                    r.unreadCount(),
                    ChatMessageResponse.from(r.lastMessage()),
                    r.updatedAt());
        }
    }
}

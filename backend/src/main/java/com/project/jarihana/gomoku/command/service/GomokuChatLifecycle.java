package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.gomoku.command.repository.GomokuChatMessageRepository;
import com.project.jarihana.gomoku.command.repository.GomokuChatRoomRepository;
import com.project.jarihana.gomoku.domain.GomokuChatRoom;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class GomokuChatLifecycle {
    private final GomokuChatRoomRepository rooms;
    private final GomokuChatMessageRepository messages;

    public void create(long roomId) {
        rooms.saveAndFlush(GomokuChatRoom.create(roomId));
    }

    public long latestSequence(long roomId) {
        return rooms.findById(roomId).map(GomokuChatRoom::getLastSequence).orElse(0L);
    }

    public void close(long roomId) {
        messages.removeByRoomId(roomId);
    }
}

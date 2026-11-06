package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.gomoku.command.repository.GomokuGameRepository;
import com.project.jarihana.gomoku.domain.GomokuGame;
import com.project.jarihana.gomoku.domain.GomokuRoom;
import com.project.jarihana.gomoku.domain.RoomStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class GomokuHistoryRecorder {
    private final GomokuGameRepository games;

    public void start(GomokuRoom room, LocalDateTime now) {
        games.save(GomokuGame.started(room, now));
    }

    public void finish(GomokuRoom previous, GomokuRoom next, LocalDateTime now) {
        if (previous.getStatus() != RoomStatus.PLAYING || next.getEndReason() == null) return;
        LocalDateTime endedAt = "TIMEOUT".equals(next.getEndReason()) ? previous.getTurnDeadline() : now;
        games.findByRoomIdAndGameNumber(previous.getId(), previous.getGameNumber())
                .ifPresent(game -> games.save(game.complete(next, endedAt)));
    }
}

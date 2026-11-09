package com.project.jarihana.gomoku.command.service;

import com.project.jarihana.gomoku.analytics.GomokuPostHogEvent;
import com.project.jarihana.gomoku.analytics.GomokuPostHogOutbox;
import com.project.jarihana.gomoku.analytics.GomokuPostHogSettings;
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
    private final GomokuPostHogSettings postHog;
    private final GomokuPostHogOutbox outbox;

    public void start(GomokuRoom room, LocalDateTime now) {
        GomokuGame game = games.save(GomokuGame.started(room, now));
        if (postHog.enabled()) outbox.enqueue(GomokuPostHogEvent.started(game));
    }

    public void finish(GomokuRoom previous, GomokuRoom next, LocalDateTime now) {
        if (previous.getStatus() != RoomStatus.PLAYING || next.getEndReason() == null) return;
        LocalDateTime endedAt = "TIMEOUT".equals(next.getEndReason()) ? previous.getTurnDeadline() : now;
        games.findByRoomIdAndGameNumber(previous.getId(), previous.getGameNumber())
                .filter(game -> game.getEndedAt() == null)
                .ifPresent(game -> {
                    GomokuGame finished = game.complete(next, endedAt);
                    games.save(finished);
                    if (postHog.enabled()) outbox.enqueue(GomokuPostHogEvent.finished(finished));
                });
    }
}

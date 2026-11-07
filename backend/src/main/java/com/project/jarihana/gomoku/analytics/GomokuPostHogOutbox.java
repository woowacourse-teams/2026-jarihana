package com.project.jarihana.gomoku.analytics;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class GomokuPostHogOutbox {
    private final JdbcClient jdbc;

    public void enqueue(GomokuPostHogEvent event) {
        jdbc.sql("""
                insert into gomoku_posthog_outbox
                    (id, game_id, event_name, occurred_at, end_reason, duration_ms, move_count)
                values (?, ?, ?, ?, ?, ?, ?)
                """)
                .params(event.id(), event.gameId(), event.name(), event.occurredAt(),
                        event.endReason(), event.durationMs(), event.moveCount())
                .update();
    }

    List<GomokuPostHogEvent> lockPending() {
        return jdbc.sql("""
                select id, game_id, event_name, occurred_at, end_reason, duration_ms, move_count
                from gomoku_posthog_outbox
                order by occurred_at, game_id, event_name desc
                limit 100
                for update skip locked
                """)
                .query((row, index) -> new GomokuPostHogEvent(row.getObject("id", UUID.class),
                        row.getLong("game_id"), row.getString("event_name"),
                        row.getObject("occurred_at", LocalDateTime.class), row.getString("end_reason"),
                        row.getObject("duration_ms", Long.class), row.getObject("move_count", Integer.class)))
                .list();
    }

    void remove(List<GomokuPostHogEvent> events) {
        jdbc.sql("delete from gomoku_posthog_outbox where id in (:ids)")
                .param("ids", events.stream().map(GomokuPostHogEvent::id).toList())
                .update();
    }
}

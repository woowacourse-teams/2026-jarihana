CREATE TABLE gomoku_posthog_outbox (
    id uuid PRIMARY KEY,
    game_id bigint NOT NULL REFERENCES gomoku_game(id) ON DELETE CASCADE,
    event_name varchar(32) NOT NULL,
    occurred_at timestamp(6) NOT NULL,
    end_reason varchar(16),
    duration_ms bigint,
    move_count integer,
    UNIQUE (game_id, event_name),
    CHECK (
        (event_name = 'gomoku_game_started' AND end_reason IS NULL AND duration_ms IS NULL AND move_count IS NULL)
        OR (event_name = 'gomoku_game_finished'
            AND end_reason IS NOT NULL AND end_reason IN ('FIVE', 'DRAW', 'RESIGN', 'TIMEOUT')
            AND duration_ms IS NOT NULL AND duration_ms >= 0
            AND move_count IS NOT NULL AND move_count BETWEEN 0 AND 225)
    )
);

CREATE INDEX idx_gomoku_posthog_pending ON gomoku_posthog_outbox (occurred_at, game_id, event_name DESC);

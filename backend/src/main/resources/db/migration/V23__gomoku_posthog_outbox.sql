CREATE TABLE gomoku_posthog_outbox (
    id uuid PRIMARY KEY,
    game_id bigint NOT NULL REFERENCES gomoku_game(id) ON DELETE CASCADE,
    event_name varchar(32) NOT NULL,
    occurred_at timestamp(6) NOT NULL,
    end_reason varchar(16),
    duration_ms bigint,
    move_count integer,
    UNIQUE (game_id, event_name)
);

CREATE INDEX idx_gomoku_posthog_pending ON gomoku_posthog_outbox (occurred_at, game_id, event_name DESC);

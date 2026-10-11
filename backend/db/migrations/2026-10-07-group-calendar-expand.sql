-- Expand-only migration. Apply before deploying backend entities that use these columns.
-- Historical backfill is intentionally separate so it can be audited and retried.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE groups
    ADD COLUMN IF NOT EXISTS show_base_schedule_in_calendar BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS ended_on DATE;

CREATE TABLE IF NOT EXISTS group_event (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    all_day BOOLEAN NOT NULL,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    description VARCHAR(10000) NOT NULL,
    location VARCHAR(255),
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT ck_group_event_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_group_event_max_span CHECK (end_date <= (start_date + INTERVAL '1 year')::date),
    CONSTRAINT ck_group_event_time_mode CHECK (
        (all_day AND start_time IS NULL AND end_time IS NULL) OR
        (NOT all_day AND start_time IS NOT NULL AND end_time IS NOT NULL AND
            (end_date > start_date OR end_time > start_time))
    )
);

CREATE INDEX IF NOT EXISTS idx_group_event_group_range
    ON group_event(group_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS group_recurring_series (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    calendar_start_date DATE NOT NULL,
    calendar_end_date DATE,
    flexible_from_date DATE,
    is_current BOOLEAN NOT NULL,
    hide_all BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT ck_group_recurring_series_dates CHECK (
        calendar_end_date IS NULL OR calendar_end_date >= calendar_start_date
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_group_recurring_current_group
    ON group_recurring_series(group_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS group_recurring_schedule_period (
    id BIGSERIAL PRIMARY KEY,
    series_id BIGINT NOT NULL REFERENCES group_recurring_series(id) ON DELETE CASCADE,
    days_of_week VARCHAR(255) NOT NULL,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    effective_from DATE NOT NULL,
    effective_until DATE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT ck_group_recurring_period_dates CHECK (
        effective_until IS NULL OR effective_until >= effective_from
    ),
    CONSTRAINT ck_group_recurring_period_times CHECK (
        (start_time IS NULL AND end_time IS NULL) OR
        (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    )
);

CREATE INDEX IF NOT EXISTS idx_group_recurring_period_series_dates
    ON group_recurring_schedule_period(series_id, effective_from, effective_until);

CREATE TABLE IF NOT EXISTS group_location_history (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    location VARCHAR(255),
    effective_from_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    effective_until_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT ck_group_location_history_dates CHECK (
        effective_until_at IS NULL OR effective_until_at > effective_from_at
    )
);

CREATE INDEX IF NOT EXISTS idx_group_location_history_group_dates
    ON group_location_history(group_id, effective_from_at, effective_until_at);

COMMIT;

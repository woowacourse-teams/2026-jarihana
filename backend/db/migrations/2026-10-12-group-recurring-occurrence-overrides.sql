-- Add per-occurrence overrides without rewriting existing calendar rows.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE group_event
    ADD COLUMN IF NOT EXISTS recurring_series_id BIGINT,
    ADD COLUMN IF NOT EXISTS recurring_period_id BIGINT,
    ADD COLUMN IF NOT EXISTS recurrence_source_date DATE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_group_event_recurring_series') THEN
        ALTER TABLE group_event
            ADD CONSTRAINT fk_group_event_recurring_series
            FOREIGN KEY (recurring_series_id) REFERENCES group_recurring_series(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_group_event_recurring_period') THEN
        ALTER TABLE group_event
            ADD CONSTRAINT fk_group_event_recurring_period
            FOREIGN KEY (recurring_period_id) REFERENCES group_recurring_schedule_period(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_group_event_recurring_reference') THEN
        ALTER TABLE group_event
            ADD CONSTRAINT ck_group_event_recurring_reference
            CHECK (
                (recurring_series_id IS NULL AND recurring_period_id IS NULL AND recurrence_source_date IS NULL)
                OR
                (recurring_series_id IS NOT NULL AND recurring_period_id IS NOT NULL AND recurrence_source_date IS NOT NULL)
            );
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_group_event_recurring_occurrence
    ON group_event(recurring_series_id, recurrence_source_date)
    WHERE recurring_series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_group_event_recurring_source_date
    ON group_event(group_id, recurrence_source_date)
    WHERE recurring_series_id IS NOT NULL;

COMMIT;

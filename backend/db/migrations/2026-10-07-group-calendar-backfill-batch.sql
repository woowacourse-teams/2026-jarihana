-- Run only after the expand migration and a compatible backend are deployed.
-- Replace the two marked numeric bounds for each small ID batch. Re-run safely after interruption.
-- Existing location is a snapshot from this batch's transaction time, not a claim about older history.
-- Check row counts and current-rule consistency between batches before enabling the calendar UI.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- BATCH_START_ID and BATCH_END_ID are operator-supplied inclusive numeric literals.
SELECT id FROM groups
WHERE id BETWEEN BATCH_START_ID AND BATCH_END_ID
ORDER BY id
FOR UPDATE;

INSERT INTO group_location_history (
    group_id, location, effective_from_at, effective_until_at, created_at, updated_at
)
SELECT g.id, g.location, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM groups g
WHERE g.id BETWEEN BATCH_START_ID AND BATCH_END_ID
  AND NOT EXISTS (SELECT 1 FROM group_location_history h WHERE h.group_id = g.id);

INSERT INTO group_recurring_series (
    group_id, calendar_start_date, calendar_end_date, is_current, hide_all, version, created_at, updated_at
)
SELECT g.id, g.created_at::date, NULL, TRUE, FALSE, 0, g.created_at, g.created_at
FROM groups g
WHERE g.id BETWEEN BATCH_START_ID AND BATCH_END_ID
  AND g.recurring_activity_days IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM group_recurring_series s WHERE s.group_id = g.id AND s.is_current
  )
ON CONFLICT DO NOTHING;

INSERT INTO group_recurring_schedule_period (
    series_id, days_of_week, start_time, end_time,
    effective_from, effective_until, created_at, updated_at
)
SELECT s.id, g.recurring_activity_days, g.recurring_start_time, g.recurring_end_time,
       s.calendar_start_date, NULL, g.created_at, g.created_at
FROM groups g
JOIN group_recurring_series s ON s.group_id = g.id AND s.is_current
WHERE g.id BETWEEN BATCH_START_ID AND BATCH_END_ID
  AND g.recurring_activity_days IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM group_recurring_schedule_period p WHERE p.series_id = s.id
  );

COMMIT;

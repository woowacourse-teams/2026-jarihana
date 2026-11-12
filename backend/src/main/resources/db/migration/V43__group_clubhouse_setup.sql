ALTER TABLE groups ADD COLUMN clubhouse_setup_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE groups ALTER COLUMN clubhouse_setup_enabled SET DEFAULT TRUE;

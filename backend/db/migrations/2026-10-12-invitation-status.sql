BEGIN;

ALTER TABLE invitation ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'VALID';
UPDATE invitation SET status = 'CANCELED' WHERE revoked_at IS NOT NULL AND status = 'VALID';

ALTER TABLE invitation ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP WITHOUT TIME ZONE;
UPDATE invitation SET status = 'REJECTED' WHERE declined_at IS NOT NULL;
ALTER TABLE invitation DROP CONSTRAINT IF EXISTS ck_invitation_declined_at;
ALTER TABLE invitation DROP COLUMN declined_at;

ALTER TABLE invitation DROP CONSTRAINT IF EXISTS ck_invitation_status;
ALTER TABLE invitation ADD CONSTRAINT ck_invitation_status CHECK (
    (status = 'VALID' AND revoked_at IS NULL)
    OR (status = 'REJECTED' AND type = 'DIRECT')
    OR (status = 'CANCELED' AND revoked_at IS NOT NULL)
);

COMMIT;

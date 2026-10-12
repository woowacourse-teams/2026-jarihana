BEGIN;

-- Preserve the oldest currently usable link per group and retain all histories.
WITH ranked AS (
    SELECT i.id, row_number() OVER (PARTITION BY i.group_id ORDER BY i.created_at, i.id) AS position
    FROM invitation i JOIN member inviter ON inviter.id = i.inviter_member_id
    JOIN groups g ON g.id = i.group_id
    WHERE i.type = 'LINK' AND i.status = 'VALID' AND i.revoked_at IS NULL
      AND i.expires_at > LOCALTIMESTAMP AND g.status = 'ACTIVE' AND inviter.withdrawn_at IS NULL
      AND EXISTS (SELECT 1 FROM group_member gm
                  WHERE gm.group_id = i.group_id AND gm.member_id = i.inviter_member_id)
)
UPDATE invitation i SET status = 'CANCELED', revoked_at = LOCALTIMESTAMP,
    updated_at = LOCALTIMESTAMP, version = i.version + 1
FROM ranked r WHERE i.id = r.id AND r.position > 1;

COMMIT;

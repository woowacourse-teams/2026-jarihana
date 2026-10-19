-- Image reference lifecycle and legacy image backfill.
-- V3__activity_post_reaction_heart_only.sql must be applied before this migration.

SET LOCAL lock_timeout = '5s';

ALTER TABLE image_upload
    ADD COLUMN IF NOT EXISTS uploader_id BIGINT,
    ADD COLUMN IF NOT EXISTS status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS attached_group_id BIGINT,
    ADD COLUMN IF NOT EXISTS source_image_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS attached_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS next_cleanup_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS cleanup_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_cleanup_error VARCHAR(1000);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_image_upload_uploader'
    ) THEN
        ALTER TABLE image_upload
            ADD CONSTRAINT fk_image_upload_uploader
            FOREIGN KEY (uploader_id) REFERENCES member (id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_image_upload_attached_group'
    ) THEN
        ALTER TABLE image_upload
            ADD CONSTRAINT fk_image_upload_attached_group
            FOREIGN KEY (attached_group_id) REFERENCES groups (id) ON DELETE SET NULL;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS image_reference (
    id BIGSERIAL PRIMARY KEY,
    image_upload_id UUID NOT NULL,
    reference_type VARCHAR(32) NOT NULL,
    owner_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_image_reference_upload
        FOREIGN KEY (image_upload_id) REFERENCES image_upload (id) ON DELETE CASCADE,
    CONSTRAINT uk_image_reference_owner_upload
        UNIQUE (reference_type, owner_id, image_upload_id),
    CONSTRAINT ck_image_reference_type
        CHECK (reference_type IN ('GROUP_REPRESENTATIVE', 'GROUP_DESCRIPTION', 'ACTIVITY_POST'))
);

CREATE INDEX IF NOT EXISTS idx_image_reference_upload
    ON image_reference (image_upload_id);
CREATE INDEX IF NOT EXISTS idx_image_reference_group
    ON image_reference (group_id);

CREATE TABLE IF NOT EXISTS image_deletion_task (
    id UUID PRIMARY KEY,
    image_upload_id UUID,
    image_key VARCHAR(255) NOT NULL,
    execute_after TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    status VARCHAR(32) NOT NULL,
    locked_until TIMESTAMP WITHOUT TIME ZONE,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_image_deletion_task_image_key UNIQUE (image_key),
    CONSTRAINT ck_image_deletion_task_status CHECK (status IN ('PENDING', 'IN_PROGRESS'))
);

CREATE INDEX IF NOT EXISTS idx_image_deletion_task_due
    ON image_deletion_task (execute_after, locked_until);
CREATE UNIQUE INDEX IF NOT EXISTS uk_image_deletion_task_upload
    ON image_deletion_task (image_upload_id)
    WHERE image_upload_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS image_promotion_task (
    id UUID PRIMARY KEY,
    image_upload_id UUID NOT NULL,
    source_image_key VARCHAR(255) NOT NULL,
    target_image_key VARCHAR(255) NOT NULL,
    reconcile_after TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_image_promotion_task_upload UNIQUE (image_upload_id),
    CONSTRAINT uk_image_promotion_task_target_key UNIQUE (target_image_key)
);

CREATE INDEX IF NOT EXISTS idx_image_promotion_task_reconcile
    ON image_promotion_task (reconcile_after);

-- Preserve representative images for every remaining group, including ended
-- groups. The default image is not a managed upload.
INSERT INTO image_reference (
    image_upload_id,
    reference_type,
    owner_id,
    group_id,
    created_at,
    updated_at
)
SELECT
    upload.id,
    'GROUP_REPRESENTATIVE',
    group_row.id,
    group_row.id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM groups AS group_row
JOIN image_upload AS upload
    ON upload.image_key = group_row.representative_image_key
WHERE group_row.representative_image_key IS NOT NULL
  AND group_row.representative_image_key <> 'groups/default.jpg'
ON CONFLICT ON CONSTRAINT uk_image_reference_owner_upload DO NOTHING;

-- Extract managed image keys from Markdown without rewriting legacy paths.
-- Both raw keys and full URLs containing the key are recognized.
INSERT INTO image_reference (
    image_upload_id,
    reference_type,
    owner_id,
    group_id,
    created_at,
    updated_at
)
SELECT DISTINCT
    upload.id,
    'GROUP_DESCRIPTION',
    group_row.id,
    group_row.id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM groups AS group_row
CROSS JOIN LATERAL regexp_matches(
    group_row.description,
    '(groups/(?:tmp|[1-9][0-9]*)/[A-Za-z0-9][A-Za-z0-9._-]{0,199}\.(?:jpg|png|webp))',
    'g'
) AS extracted(matches)
JOIN image_upload AS upload
    ON upload.image_key = extracted.matches[1]
WHERE group_row.description IS NOT NULL
ON CONFLICT ON CONSTRAINT uk_image_reference_owner_upload DO NOTHING;

-- Hidden activity posts are deliberately excluded. Their photos are no longer
-- readable and become cleanup candidates once the worker is explicitly enabled.
INSERT INTO image_reference (
    image_upload_id,
    reference_type,
    owner_id,
    group_id,
    created_at,
    updated_at
)
SELECT
    upload.id,
    'ACTIVITY_POST',
    post.id,
    post.group_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM activity_post_photo AS photo
JOIN activity_post AS post
    ON post.id = photo.activity_post_id
JOIN image_upload AS upload
    ON upload.image_key = photo.image_key
WHERE post.deleted_at IS NULL
  AND post.group_id IS NOT NULL
ON CONFLICT ON CONSTRAINT uk_image_reference_owner_upload DO NOTHING;

UPDATE image_upload AS upload
SET status = CASE
        WHEN EXISTS (
            SELECT 1
            FROM image_reference AS reference
            WHERE reference.image_upload_id = upload.id
        ) THEN 'ATTACHED'
        ELSE 'TEMPORARY'
    END,
    attached_at = CASE
        WHEN EXISTS (
            SELECT 1
            FROM image_reference AS reference
            WHERE reference.image_upload_id = upload.id
        ) THEN COALESCE(upload.attached_at, upload.updated_at, upload.created_at)
        ELSE upload.attached_at
    END
WHERE upload.status IS NULL;

UPDATE image_upload AS upload
SET attached_group_id = reference_group.group_id
FROM (
    SELECT image_upload_id, MIN(group_id) AS group_id
    FROM image_reference
    GROUP BY image_upload_id
    HAVING COUNT(DISTINCT group_id) = 1
) AS reference_group
WHERE upload.id = reference_group.image_upload_id
  AND upload.attached_group_id IS NULL;

ALTER TABLE image_upload
    ALTER COLUMN status SET DEFAULT 'TEMPORARY',
    ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ck_image_upload_status'
    ) THEN
        ALTER TABLE image_upload
            ADD CONSTRAINT ck_image_upload_status
            CHECK (status IN ('TEMPORARY', 'PROMOTING', 'ATTACHED', 'DELETE_PENDING'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_image_upload_status_expires
    ON image_upload (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_image_upload_cleanup_due
    ON image_upload (status, next_cleanup_at);

SET LOCAL lock_timeout = '5s';

ALTER TABLE image_upload
    ADD COLUMN attached_sparring_id BIGINT,
    ADD CONSTRAINT fk_image_upload_attached_sparring
        FOREIGN KEY (attached_sparring_id) REFERENCES sparring_topic (id) ON DELETE SET NULL,
    ADD CONSTRAINT ck_image_upload_attachment_scope
        CHECK (attached_group_id IS NULL OR attached_sparring_id IS NULL);

ALTER TABLE image_reference
    ALTER COLUMN group_id DROP NOT NULL,
    DROP CONSTRAINT ck_image_reference_type,
    ADD CONSTRAINT ck_image_reference_type
        CHECK (reference_type IN ('GROUP_REPRESENTATIVE', 'GROUP_DESCRIPTION', 'ACTIVITY_POST', 'SPARRING_REPRESENTATIVE')),
    ADD CONSTRAINT ck_image_reference_scope
        CHECK ((reference_type = 'SPARRING_REPRESENTATIVE' AND group_id IS NULL)
            OR (reference_type <> 'SPARRING_REPRESENTATIVE' AND group_id IS NOT NULL));

CREATE UNIQUE INDEX uk_image_reference_sparring_representative
    ON image_reference (owner_id) WHERE reference_type = 'SPARRING_REPRESENTATIVE';

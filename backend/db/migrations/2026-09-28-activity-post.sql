BEGIN;

CREATE TABLE IF NOT EXISTS activity_post (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT,
    author_member_id BIGINT NOT NULL,
    caption VARCHAR(50),
    activity_date DATE NOT NULL,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_activity_post_group FOREIGN KEY (group_id) REFERENCES groups (id),
    CONSTRAINT fk_activity_post_author FOREIGN KEY (author_member_id) REFERENCES member (id)
);

CREATE TABLE IF NOT EXISTS activity_post_photo (
    id BIGSERIAL PRIMARY KEY,
    activity_post_id BIGINT NOT NULL,
    image_key VARCHAR(255) NOT NULL,
    CONSTRAINT uk_activity_post_photo_post_id UNIQUE (activity_post_id),
    CONSTRAINT uk_activity_post_photo_image_key UNIQUE (image_key),
    CONSTRAINT fk_activity_post_photo_post FOREIGN KEY (activity_post_id) REFERENCES activity_post (id)
);

CREATE INDEX IF NOT EXISTS idx_activity_post_date_id
    ON activity_post (activity_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_post_group_date_id
    ON activity_post (group_id, activity_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_activity_post_author_date_id
    ON activity_post (author_member_id, activity_date DESC, id DESC);

COMMIT;

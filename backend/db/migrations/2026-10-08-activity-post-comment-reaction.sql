BEGIN;

CREATE TABLE IF NOT EXISTS activity_post_comment (
    id BIGSERIAL PRIMARY KEY,
    activity_post_id BIGINT NOT NULL,
    author_member_id BIGINT NOT NULL,
    content VARCHAR(200) NOT NULL,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_activity_post_comment_post FOREIGN KEY (activity_post_id) REFERENCES activity_post (id),
    CONSTRAINT fk_activity_post_comment_author FOREIGN KEY (author_member_id) REFERENCES member (id)
);

CREATE INDEX IF NOT EXISTS idx_activity_post_comment_post_created_id
    ON activity_post_comment (activity_post_id, created_at, id);

CREATE TABLE IF NOT EXISTS activity_post_reaction (
    id BIGSERIAL PRIMARY KEY,
    activity_post_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_activity_post_reaction_post_member_emoji UNIQUE (activity_post_id, member_id, emoji),
    CONSTRAINT fk_activity_post_reaction_post FOREIGN KEY (activity_post_id) REFERENCES activity_post (id),
    CONSTRAINT fk_activity_post_reaction_member FOREIGN KEY (member_id) REFERENCES member (id)
);

CREATE TABLE IF NOT EXISTS activity_post_comment_reaction (
    id BIGSERIAL PRIMARY KEY,
    activity_post_comment_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_activity_post_comment_reaction_comment_member_emoji
        UNIQUE (activity_post_comment_id, member_id, emoji),
    CONSTRAINT fk_activity_post_comment_reaction_comment
        FOREIGN KEY (activity_post_comment_id) REFERENCES activity_post_comment (id),
    CONSTRAINT fk_activity_post_comment_reaction_member FOREIGN KEY (member_id) REFERENCES member (id)
);

COMMIT;

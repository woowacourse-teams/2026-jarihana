-- 활동 기록 댓글과 반응을 저장한다. 반응은 우선 하트 하나만 허용한다.
SET LOCAL lock_timeout = '5s';

CREATE TABLE activity_post_comment (
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

CREATE INDEX idx_activity_post_comment_post_created_id
    ON activity_post_comment (activity_post_id, created_at, id);

CREATE TABLE activity_post_reaction (
    id BIGSERIAL PRIMARY KEY,
    activity_post_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_activity_post_reaction_post_member_emoji UNIQUE (activity_post_id, member_id, emoji),
    CONSTRAINT fk_activity_post_reaction_post FOREIGN KEY (activity_post_id) REFERENCES activity_post (id),
    CONSTRAINT fk_activity_post_reaction_member FOREIGN KEY (member_id) REFERENCES member (id),
    CONSTRAINT ck_activity_post_reaction_emoji CHECK (emoji IN ('HEART'))
);

CREATE TABLE activity_post_comment_reaction (
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
    CONSTRAINT fk_activity_post_comment_reaction_member FOREIGN KEY (member_id) REFERENCES member (id),
    CONSTRAINT ck_activity_post_comment_reaction_emoji CHECK (emoji IN ('HEART'))
);

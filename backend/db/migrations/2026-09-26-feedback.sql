BEGIN;

CREATE TABLE IF NOT EXISTS feedback (
    id BIGSERIAL PRIMARY KEY,
    content VARCHAR(1000) NOT NULL,
    member_id BIGINT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_feedback_member_id FOREIGN KEY (member_id) REFERENCES member (id)
);

COMMIT;

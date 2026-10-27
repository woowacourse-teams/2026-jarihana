-- 자유게시판의 모임 제안, 함께하고 싶어요 응답, 코멘트를 저장한다.
-- 새 테이블만 추가하므로 직전 버전 앱은 이 테이블을 읽거나 쓰지 않고 그대로 동작한다.
CREATE TABLE IF NOT EXISTS proposal (
    id BIGSERIAL PRIMARY KEY,
    author_member_id BIGINT NOT NULL,
    category VARCHAR(20) NOT NULL,
    title VARCHAR(50) NOT NULL,
    content VARCHAR(1000) NOT NULL,
    mood_options VARCHAR(100) NOT NULL,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_proposal_author FOREIGN KEY (author_member_id) REFERENCES member (id),
    CONSTRAINT ck_proposal_category CHECK (category IN ('STUDY', 'CULTURE', 'SPORT', 'ETC'))
);

CREATE INDEX IF NOT EXISTS idx_proposal_created_id
    ON proposal (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_category_created_id
    ON proposal (category, created_at DESC, id DESC);

-- 회원마다 제안 하나에 응답 하나만 둔다. 조건은 비어 있을 수 있어 빈 문자열로 저장한다.
CREATE TABLE IF NOT EXISTS proposal_interest (
    id BIGSERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    time_slots VARCHAR(100) NOT NULL,
    meeting_modes VARCHAR(30) NOT NULL,
    mood_indexes VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT uk_proposal_interest_proposal_member UNIQUE (proposal_id, member_id),
    CONSTRAINT fk_proposal_interest_proposal FOREIGN KEY (proposal_id) REFERENCES proposal (id),
    CONSTRAINT fk_proposal_interest_member FOREIGN KEY (member_id) REFERENCES member (id)
);

CREATE TABLE IF NOT EXISTS proposal_comment (
    id BIGSERIAL PRIMARY KEY,
    proposal_id BIGINT NOT NULL,
    author_member_id BIGINT NOT NULL,
    content VARCHAR(300) NOT NULL,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_proposal_comment_proposal FOREIGN KEY (proposal_id) REFERENCES proposal (id),
    CONSTRAINT fk_proposal_comment_author FOREIGN KEY (author_member_id) REFERENCES member (id)
);

CREATE INDEX IF NOT EXISTS idx_proposal_comment_proposal_created_id
    ON proposal_comment (proposal_id, created_at, id);

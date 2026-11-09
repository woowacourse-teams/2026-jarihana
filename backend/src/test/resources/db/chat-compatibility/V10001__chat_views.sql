-- 회원의 기기·탭별 채팅 화면 상태를 짧은 TTL로 보관한다.
SET LOCAL lock_timeout = '5s';

CREATE TABLE chat_views (
    member_id bigint NOT NULL REFERENCES member(id) ON DELETE CASCADE,
    view_id uuid NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    group_id bigint REFERENCES groups(id) ON DELETE SET NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    PRIMARY KEY (member_id, view_id)
);

CREATE INDEX idx_chat_views_active_room
    ON chat_views (member_id, group_id, expires_at)
    WHERE group_id IS NOT NULL;
CREATE INDEX idx_chat_views_expiry ON chat_views (expires_at);

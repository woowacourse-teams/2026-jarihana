CREATE TABLE member_activity (
    member_id bigint PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
    last_active_at timestamp(6) without time zone NOT NULL
);

CREATE INDEX idx_notifications_chat_room
    ON notifications (member_id, (payload->>'groupId'), id DESC)
    WHERE event_type = 'CHAT_MESSAGE_RECEIVED';

DROP TABLE chat_views;

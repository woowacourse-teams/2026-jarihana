-- 내 활동 기록에 다른 회원이 댓글이나 좋아요를 남기면 기록 작성자에게 알린다. 기존 사건 종류는 그대로 둔다.
SET LOCAL lock_timeout = '5s';

ALTER TABLE notifications DROP CONSTRAINT ck_notifications_event_type;

ALTER TABLE notifications ADD CONSTRAINT ck_notifications_event_type CHECK (
    event_type IN ('GROUP_CREATED', 'REGISTRATION_SUBMITTED', 'PARTICIPANT_JOINED', 'REGISTRATION_APPROVED',
                   'REGISTRATION_REJECTED', 'REGISTRATION_SYSTEM_REJECTED', 'INVITATION_RECEIVED',
                   'ACTIVITY_POST_COMMENTED', 'ACTIVITY_POST_REACTED')
);

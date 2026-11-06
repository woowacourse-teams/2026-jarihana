-- 채팅 알림과 이를 표시할 수 있는 브라우저 계약 3을 허용한다.
SET LOCAL lock_timeout = '5s';

ALTER TABLE notifications ADD CONSTRAINT ck_notifications_event_type_chat CHECK (
    event_type IN ('GROUP_CREATED', 'REGISTRATION_SUBMITTED', 'PARTICIPANT_JOINED', 'REGISTRATION_APPROVED',
                   'REGISTRATION_REJECTED', 'REGISTRATION_SYSTEM_REJECTED', 'INVITATION_RECEIVED',
                   'ACTIVITY_POST_COMMENTED', 'ACTIVITY_POST_REACTED', 'GROUP_ANNOUNCEMENT_CREATED',
                   'CHAT_MESSAGE_RECEIVED')
) NOT VALID;
ALTER TABLE notifications DROP CONSTRAINT ck_notifications_event_type;
ALTER TABLE notifications RENAME CONSTRAINT ck_notifications_event_type_chat TO ck_notifications_event_type;

ALTER TABLE push_subscriptions ADD CONSTRAINT ck_push_subscriptions_client_version_chat
    CHECK (client_version IN (1, 2, 3)) NOT VALID;
ALTER TABLE push_subscriptions DROP CONSTRAINT ck_push_subscriptions_client_version;
ALTER TABLE push_subscriptions RENAME CONSTRAINT ck_push_subscriptions_client_version_chat
    TO ck_push_subscriptions_client_version;

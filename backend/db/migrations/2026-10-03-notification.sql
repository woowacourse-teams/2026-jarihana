BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    event_key VARCHAR(160) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload_version SMALLINT NOT NULL,
    payload JSONB NOT NULL,
    read_at TIMESTAMP WITHOUT TIME ZONE,
    deleted_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_notifications_member FOREIGN KEY (member_id) REFERENCES member (id),
    CONSTRAINT uq_notifications_event_member UNIQUE (event_key, member_id),
    CONSTRAINT ck_notifications_payload CHECK (
        payload_version > 0 AND jsonb_typeof(payload) = 'object' AND length(trim(event_key)) > 0
    ),
    CONSTRAINT ck_notifications_event_type CHECK (
        event_type IN ('REGISTRATION_SUBMITTED', 'PARTICIPANT_JOINED', 'REGISTRATION_APPROVED',
            'REGISTRATION_REJECTED', 'REGISTRATION_SYSTEM_REJECTED')
    )
);

CREATE INDEX IF NOT EXISTS idx_notifications_inbox
    ON notifications (member_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications (member_id, id) WHERE deleted_at IS NULL AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    endpoint VARCHAR(2048) NOT NULL,
    p256dh VARCHAR(128) NOT NULL,
    auth VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL,
    generation BIGINT NOT NULL,
    last_seen_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    disabled_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_push_subscriptions_member FOREIGN KEY (member_id) REFERENCES member (id),
    CONSTRAINT uq_push_subscriptions_endpoint UNIQUE (endpoint),
    CONSTRAINT ck_push_subscriptions_connection CHECK (
        generation > 0 AND octet_length(endpoint) BETWEEN 1 AND 2048
        AND ((enabled AND disabled_at IS NULL) OR (NOT enabled AND disabled_at IS NOT NULL))
    )
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
    ON push_subscriptions (member_id, id) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGSERIAL PRIMARY KEY,
    notification_id BIGINT NOT NULL,
    push_subscription_id BIGINT NOT NULL,
    subscription_generation BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempt_count INTEGER NOT NULL,
    next_attempt_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    lease_token UUID,
    locked_until TIMESTAMP WITHOUT TIME ZONE,
    accepted_at TIMESTAMP WITHOUT TIME ZONE,
    last_error_code VARCHAR(50),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_notification_deliveries_notification FOREIGN KEY (notification_id) REFERENCES notifications (id),
    CONSTRAINT fk_notification_deliveries_subscription FOREIGN KEY (push_subscription_id) REFERENCES push_subscriptions (id),
    CONSTRAINT uq_notification_deliveries_target UNIQUE (notification_id, push_subscription_id, subscription_generation),
    CONSTRAINT ck_notification_deliveries_state CHECK (
        subscription_generation > 0 AND attempt_count BETWEEN 0 AND 5 AND expires_at > created_at
        AND ((status = 'IN_FLIGHT' AND lease_token IS NOT NULL AND locked_until IS NOT NULL)
            OR (status <> 'IN_FLIGHT' AND lease_token IS NULL AND locked_until IS NULL))
        AND ((status = 'ACCEPTED' AND accepted_at IS NOT NULL)
            OR (status <> 'ACCEPTED' AND accepted_at IS NULL))
        AND ((status = 'PENDING' AND attempt_count = 0)
            OR (status IN ('IN_FLIGHT', 'ACCEPTED') AND attempt_count >= 1)
            OR (status = 'RETRY' AND attempt_count BETWEEN 1 AND 4)
            OR status IN ('FAILED', 'CANCELLED'))
    ),
    CONSTRAINT ck_notification_deliveries_status CHECK (
        status IN ('PENDING', 'IN_FLIGHT', 'RETRY', 'ACCEPTED', 'FAILED', 'CANCELLED')
    )
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_due
    ON notification_deliveries (next_attempt_at, id) WHERE status IN ('PENDING', 'RETRY');
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_expired_lease
    ON notification_deliveries (locked_until, id) WHERE status = 'IN_FLIGHT';

COMMIT;

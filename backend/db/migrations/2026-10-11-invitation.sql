BEGIN;

ALTER TABLE registration ADD COLUMN IF NOT EXISTS approval_origin VARCHAR(20);
UPDATE registration SET approval_origin = 'RECRUITMENT' WHERE approval_origin IS NULL;
ALTER TABLE registration ALTER COLUMN approval_origin SET DEFAULT 'RECRUITMENT';
ALTER TABLE registration ALTER COLUMN approval_origin SET NOT NULL;

ALTER TABLE registration DROP CONSTRAINT IF EXISTS ck_registration_approval_origin;
ALTER TABLE registration ADD CONSTRAINT ck_registration_approval_origin CHECK (
    approval_origin = 'RECRUITMENT'
    OR (approval_origin = 'INVITATION' AND status = 'APPROVED'
        AND decided_by_type IS NOT NULL AND decided_by_type = 'SYSTEM')
);

CREATE TABLE IF NOT EXISTS invitation (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL,
    inviter_member_id BIGINT NOT NULL,
    target_member_id BIGINT,
    type VARCHAR(20) NOT NULL,
    message VARCHAR(200),
    request_id UUID NOT NULL,
    token_hash VARCHAR(64),
    encrypted_token VARCHAR(512),
    expires_at TIMESTAMP WITHOUT TIME ZONE,
    revoked_at TIMESTAMP WITHOUT TIME ZONE,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_invitation_group FOREIGN KEY (group_id) REFERENCES groups(id),
    CONSTRAINT fk_invitation_inviter FOREIGN KEY (inviter_member_id) REFERENCES member(id),
    CONSTRAINT fk_invitation_target FOREIGN KEY (target_member_id) REFERENCES member(id),
    CONSTRAINT uk_invitation_inviter_request UNIQUE (inviter_member_id, request_id),
    CONSTRAINT uk_invitation_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_invitation_type CHECK (
        (type = 'DIRECT' AND target_member_id IS NOT NULL AND target_member_id <> inviter_member_id
            AND expires_at IS NULL AND token_hash IS NULL AND encrypted_token IS NULL)
        OR (type = 'LINK' AND target_member_id IS NULL AND expires_at IS NOT NULL
            AND expires_at > created_at AND token_hash IS NOT NULL AND token_hash ~ '^[0-9a-f]{64}$'
            AND encrypted_token IS NOT NULL AND length(trim(encrypted_token)) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_invitation_group_created ON invitation (group_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_invitation_target_created ON invitation (target_member_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS invitation_acceptance (
    id BIGSERIAL PRIMARY KEY,
    invitation_id BIGINT NOT NULL,
    member_id BIGINT NOT NULL,
    accepted_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT fk_invitation_acceptance_invitation FOREIGN KEY (invitation_id) REFERENCES invitation(id),
    CONSTRAINT fk_invitation_acceptance_member FOREIGN KEY (member_id) REFERENCES member(id),
    CONSTRAINT uk_invitation_acceptance_invitation_member UNIQUE (invitation_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_invitation_acceptance_member ON invitation_acceptance (member_id, accepted_at DESC, id DESC);

COMMIT;

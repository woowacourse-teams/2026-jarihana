ALTER TABLE point_reward
    DROP CONSTRAINT point_reward_reason_check,
    ADD CONSTRAINT ck_point_reward_reason_format CHECK (reason ~ '^[A-Z][A-Z0-9_]{0,29}$');

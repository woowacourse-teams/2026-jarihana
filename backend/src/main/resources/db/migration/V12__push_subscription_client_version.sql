SET LOCAL lock_timeout = '5s';

-- 기존 브라우저/SW와 구버전 앱의 INSERT는 공지 미지원으로 유지한다.
ALTER TABLE push_subscriptions
    ADD COLUMN client_version integer NOT NULL DEFAULT 1;

ALTER TABLE push_subscriptions
    ADD CONSTRAINT ck_push_subscriptions_client_version CHECK (client_version IN (1, 2));

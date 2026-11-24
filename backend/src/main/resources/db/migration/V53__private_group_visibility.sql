-- 새 접근 규칙을 배포한 뒤 설정 API에서 PRIVATE를 저장한다.
SET LOCAL lock_timeout = '5s';

ALTER TABLE groups
    DROP CONSTRAINT ck_groups_visibility,
    ADD CONSTRAINT ck_groups_visibility CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'CREW_ONLY'));

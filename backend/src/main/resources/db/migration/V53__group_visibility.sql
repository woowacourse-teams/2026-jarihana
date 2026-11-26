-- 모임 공개 범위. PUBLIC은 누구에게나 보이고, PRIVATE은 현재 구성원에게만,
-- AFFILIATION_ONLY는 visible_affiliation_id 소속 회원과 현재 구성원에게만 보인다.
-- 공개 범위를 모르는 이전 버전이 같은 DB를 함께 쓰므로 기본값이 있거나 비어도 되는 컬럼만 더한다(Expand).
-- 이전 버전의 INSERT는 두 컬럼을 채우지 않아 PUBLIC이 되고, UPDATE는 두 컬럼을 건드리지 않아 기존 값이 유지된다.
-- 상수 기본값이라 PostgreSQL 11 이상에서는 테이블을 다시 쓰지 않는다. CHECK는 groups 전체를 한 번 읽는다.
SET LOCAL lock_timeout = '5s';

ALTER TABLE groups
    ADD COLUMN visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
    ADD COLUMN visible_affiliation_id BIGINT,
    ADD CONSTRAINT ck_groups_visibility CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'AFFILIATION_ONLY')),
    ADD CONSTRAINT ck_groups_visible_affiliation CHECK (
        (visibility = 'AFFILIATION_ONLY') = (visible_affiliation_id IS NOT NULL)
    ),
    ADD CONSTRAINT fk_groups_visible_affiliation FOREIGN KEY (visible_affiliation_id) REFERENCES affiliation (id);

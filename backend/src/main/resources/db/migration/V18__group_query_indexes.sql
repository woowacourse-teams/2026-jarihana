-- 모임 목록 정렬과 모집·신청 일괄 조회를 지원한다.
SET LOCAL lock_timeout = '5s';

CREATE INDEX idx_groups_status_created_id
    ON groups (status, created_at DESC, id DESC);

CREATE INDEX idx_group_recruitment_group_id
    ON group_recruitment (group_id);

CREATE INDEX idx_registration_recruitment_id
    ON registration (recruitment_id);

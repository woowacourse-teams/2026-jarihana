-- 편별 최신 글과 커서 조회가 다른 편의 글을 순서대로 검사하지 않도록 지원한다.
-- 일반 CREATE INDEX는 구축 중 쓰기를 대기시키므로 큰 테이블은 배포 전 소요 시간을 확인한다.
SET LOCAL lock_timeout = '5s';

CREATE INDEX idx_sparring_post_topic_side_id
    ON sparring_post (topic_id, side, id);

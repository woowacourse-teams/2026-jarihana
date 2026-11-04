-- 공지 삭제 이력과 알림 대상 식별자를 보존하면서 일반 조회에서 숨긴다.
-- 구버전 인스턴스의 공지 INSERT가 새 컬럼을 지정하지 않아도 동작하도록 nullable로 둔다.
SET LOCAL lock_timeout = '5s';

ALTER TABLE announcements ADD COLUMN deleted_at timestamp(6) without time zone;

-- 피드 반응을 하트 하나로 줄인다. 출시 전 기능이라 하트가 아닌 반응은 지우고 검사 제약을 둔다.
SET LOCAL lock_timeout = '5s';

DELETE FROM activity_post_comment_reaction WHERE emoji <> 'HEART';
DELETE FROM activity_post_reaction WHERE emoji <> 'HEART';

ALTER TABLE activity_post_reaction
    ADD CONSTRAINT ck_activity_post_reaction_emoji CHECK (emoji IN ('HEART'));

ALTER TABLE activity_post_comment_reaction
    ADD CONSTRAINT ck_activity_post_comment_reaction_emoji CHECK (emoji IN ('HEART'));

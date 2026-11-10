-- 리듬 작살 공식 도전에 스윙 편곡 번외 난이도 ANOTHER Hard, ANOTHER Hardest를 더한다. 기존 기록과 값은 바꾸지 않는다.
ALTER TABLE rhythm_challenge DROP CONSTRAINT rhythm_challenge_level_check;
ALTER TABLE rhythm_challenge
    ADD CONSTRAINT rhythm_challenge_level_check
        CHECK (level IN ('EASY', 'MEDIUM', 'HARD', 'HARDEST', 'ANOTHER_HARD', 'ANOTHER_HARDEST'));

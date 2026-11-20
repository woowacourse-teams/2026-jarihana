-- 가입 화면이 소속을 묻지 않게 되면서 부트캠프 회원과 현직자를 기본 멤버로 옮긴다.
-- 크루 명단을 이 migration보다 먼저 적재하면, 그중 명단에 있는 사람은 적재 스크립트가 이미 크루로 바꿔 두었다.
-- 나중에 명단에 들어온 사람은 다음 GitHub 로그인이나 명단 재적재 때 크루가 된다.
-- 소속 컬럼은 Contract 단계에서 지울 때까지 남겨 두되, MEMBER 제약(V25)에 맞게 값을 비운다.
UPDATE member
SET member_type = 'MEMBER',
    bootcamp_name = NULL,
    bootcamp_status = NULL,
    bootcamp_cohort = NULL,
    field = NULL,
    career = NULL,
    company_name = NULL,
    company_visible = NULL,
    updated_at = localtimestamp
WHERE member_type IN ('BOOTCAMP', 'PROFESSIONAL');

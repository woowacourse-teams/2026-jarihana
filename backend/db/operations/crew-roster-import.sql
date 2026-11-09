-- 우테코 크루 명단을 crew_roster에 넣고, 이미 가입한 사람 중 명단에 있는 사람을 크루로 바꾼다.
--
-- 실행: psql "$DATABASE_URL" -f backend/db/operations/crew-roster-import.sql < crew_whitelist.csv
--
-- CSV 열 순서: github_id,crew_name,generation,course,github_login (첫 줄은 헤더)
-- crew_name과 github_login은 읽기만 하고 저장하지 않는다. 명단 파일은 저장소에 두지 않는다.
-- 명단에서 빠진 사람은 지우지 않는다. 같은 github_id가 다시 오면 기수와 과정을 새 값으로 바꾼다.
-- 한 줄이라도 잘못되면 전체를 되돌린다.
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE crew_roster_import (
    github_id text,
    crew_name text,
    generation integer,
    course text,
    github_login text
) ON COMMIT DROP;

\copy crew_roster_import FROM pstdin WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM crew_roster_import) THEN
        RAISE EXCEPTION '명단이 비어 있습니다.';
    END IF;
    IF EXISTS (SELECT 1 FROM crew_roster_import WHERE github_id IS NULL OR github_id !~ '^[0-9]+$') THEN
        RAISE EXCEPTION 'github_id는 GitHub 숫자 id여야 합니다.';
    END IF;
    IF EXISTS (SELECT github_id FROM crew_roster_import GROUP BY github_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION '같은 github_id가 두 번 이상 있습니다.';
    END IF;
END
$$;

-- 기수와 과정 값의 형식은 crew_roster 제약이 검사한다.
INSERT INTO crew_roster (github_id, generation, course)
SELECT github_id, generation, course
FROM crew_roster_import
ON CONFLICT (github_id) DO UPDATE
SET generation = EXCLUDED.generation,
    course = EXCLUDED.course,
    updated_at = localtimestamp;

-- 회원 모델 문서의 크루 명단 인증 규칙과 같다.
-- 기본 멤버, 부트캠프 회원, 현직자만 바꾸고 닉네임은 유지한다.
-- 같은 기수에 같은 닉네임의 크루가 있으면 건너뛴다. 코치나 다른 비크루 회원과는
-- uk_member_non_crew_name 때문에 처음부터 닉네임이 겹칠 수 없다.
UPDATE member AS m
SET member_type = 'CREW',
    generation = r.generation,
    course = r.course,
    bootcamp_name = NULL,
    bootcamp_status = NULL,
    bootcamp_cohort = NULL,
    field = NULL,
    career = NULL,
    company_name = NULL,
    company_visible = NULL,
    updated_at = localtimestamp
FROM crew_roster AS r
WHERE m.github_id = r.github_id
  AND m.member_type IN ('MEMBER', 'BOOTCAMP', 'PROFESSIONAL')
  AND NOT EXISTS (
      SELECT 1
      FROM member AS crew
      WHERE crew.member_type = 'CREW'
        AND crew.crew_name = m.crew_name
        AND crew.generation = r.generation
  );

COMMIT;

-- 부트캠프 회원과 현직자를 받기 위한 Expand 단계다.
-- 새 컬럼은 모두 nullable이라 이전 버전 앱이 크루와 코치를 저장할 때 채우지 않아도 된다.
ALTER TABLE member
    ADD COLUMN bootcamp_name character varying(30),
    ADD COLUMN bootcamp_status character varying(20),
    ADD COLUMN bootcamp_cohort character varying(20),
    ADD COLUMN field character varying(20),
    ADD COLUMN career character varying(20),
    ADD COLUMN company_name character varying(50),
    ADD COLUMN company_visible boolean;

ALTER TABLE member
    ADD CONSTRAINT ck_member_bootcamp_status CHECK (
        (bootcamp_status)::text = ANY (ARRAY['IN_PROGRESS'::text, 'COMPLETED'::text])
    ),
    ADD CONSTRAINT ck_member_field CHECK (
        (field)::text = ANY (ARRAY['FRONTEND'::text, 'BACKEND'::text, 'ANDROID'::text, 'IOS'::text,
                                   'DATA_AI'::text, 'DESIGN'::text, 'PRODUCT'::text, 'ETC'::text])
    ),
    ADD CONSTRAINT ck_member_career CHECK (
        (career)::text = ANY (ARRAY['UNDER_1'::text, 'YEARS_1_3'::text, 'YEARS_4_6'::text, 'YEARS_7_PLUS'::text])
    );

-- 크루와 코치 조건은 V1과 같고, 두 유형 모두 새 소속 컬럼을 비워 둔다.
ALTER TABLE member DROP CONSTRAINT ck_member_profile_fields;

ALTER TABLE member
    ADD CONSTRAINT ck_member_profile_fields CHECK (
        (
            (member_type)::text = 'COACH'::text
            AND course IS NULL AND generation IS NULL
            AND bootcamp_name IS NULL AND bootcamp_status IS NULL AND bootcamp_cohort IS NULL
            AND field IS NULL AND career IS NULL AND company_name IS NULL AND company_visible IS NULL
        )
        OR (
            (member_type)::text = 'CREW'::text
            AND course IS NOT NULL AND generation > 0
            AND bootcamp_name IS NULL AND bootcamp_status IS NULL AND bootcamp_cohort IS NULL
            AND field IS NULL AND career IS NULL AND company_name IS NULL AND company_visible IS NULL
        )
        OR (
            (member_type)::text = 'BOOTCAMP'::text
            AND course IS NULL AND generation IS NULL
            AND bootcamp_name IS NOT NULL AND bootcamp_status IS NOT NULL AND field IS NOT NULL
            AND career IS NULL AND company_name IS NULL AND company_visible IS NULL
        )
        OR (
            (member_type)::text = 'PROFESSIONAL'::text
            AND course IS NULL AND generation IS NULL
            AND bootcamp_name IS NULL AND bootcamp_status IS NULL AND bootcamp_cohort IS NULL
            AND field IS NOT NULL AND career IS NOT NULL
            AND ((company_name IS NULL AND company_visible IS NULL)
                OR (company_name IS NOT NULL AND company_visible IS NOT NULL))
        )
    );

-- 기수가 없는 회원(코치, 부트캠프, 현직자)끼리는 닉네임이 겹치지 않는다.
-- 지금은 코치만 해당해 uk_member_coach_name과 의미가 같으며, 그 인덱스는 그대로 둔다.
CREATE UNIQUE INDEX uk_member_non_crew_name ON member USING btree (crew_name) WHERE ((member_type)::text <> 'CREW'::text);

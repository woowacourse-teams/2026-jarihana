-- 소속을 묻지 않고 가입하는 기본 멤버(MEMBER)를 받기 위한 Expand 단계다.
-- 기존 네 유형의 조건은 V11과 같고, MEMBER는 기수, 과정, 소속 정보를 모두 비워 둔다.
-- 기본 멤버의 닉네임 중복은 V11의 uk_member_non_crew_name(member_type <> 'CREW')이 그대로 막는다.
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
        OR (
            (member_type)::text = 'MEMBER'::text
            AND course IS NULL AND generation IS NULL
            AND bootcamp_name IS NULL AND bootcamp_status IS NULL AND bootcamp_cohort IS NULL
            AND field IS NULL AND career IS NULL AND company_name IS NULL AND company_visible IS NULL
        )
    );

BEGIN;

ALTER TABLE member
    ADD COLUMN IF NOT EXISTS member_type VARCHAR(20);

UPDATE member
SET member_type = CASE
                      WHEN course = 'COACH' THEN 'COACH'
                      ELSE 'CREW'
                  END
WHERE member_type IS NULL;

UPDATE member
SET course = NULL,
    generation = NULL
WHERE member_type = 'COACH';

ALTER TABLE member
    ALTER COLUMN generation DROP NOT NULL,
    ALTER COLUMN course DROP NOT NULL,
    ALTER COLUMN member_type SET NOT NULL;

ALTER TABLE member
    DROP CONSTRAINT IF EXISTS member_course_check;

ALTER TABLE member
    DROP CONSTRAINT IF EXISTS ck_member_profile_fields;

ALTER TABLE member
    ADD CONSTRAINT ck_member_profile_fields CHECK (
        (member_type = 'COACH' AND course IS NULL AND generation IS NULL)
        OR
        (member_type = 'CREW' AND course IS NOT NULL AND generation > 0)
    );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uk_member_crew_name_generation'
          AND conrelid = 'member'::regclass
    ) THEN
        ALTER TABLE member
            ADD CONSTRAINT uk_member_crew_name_generation UNIQUE (crew_name, generation);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uk_member_coach_name
    ON member (crew_name)
    WHERE member_type = 'COACH';

CREATE OR REPLACE FUNCTION prevent_member_name_conflict()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.crew_name, 0));

    IF NEW.member_type = 'COACH' AND EXISTS (
        SELECT 1
        FROM member existing
        WHERE existing.crew_name = NEW.crew_name
          AND existing.id IS DISTINCT FROM NEW.id
    ) THEN
        RAISE EXCEPTION 'member name is already in use'
            USING ERRCODE = '23505', CONSTRAINT = 'uk_member_name_scope';
    END IF;

    IF NEW.member_type = 'CREW' AND EXISTS (
        SELECT 1
        FROM member existing
        WHERE existing.crew_name = NEW.crew_name
          AND existing.id IS DISTINCT FROM NEW.id
          AND (existing.member_type = 'COACH' OR existing.generation = NEW.generation)
    ) THEN
        RAISE EXCEPTION 'member name is already in use'
            USING ERRCODE = '23505', CONSTRAINT = 'uk_member_name_scope';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_name_conflict ON member;

CREATE TRIGGER trg_member_name_conflict
BEFORE INSERT OR UPDATE OF crew_name, generation, member_type
ON member
FOR EACH ROW
EXECUTE FUNCTION prevent_member_name_conflict();

COMMIT;

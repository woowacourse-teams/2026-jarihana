-- Run independently of application Flyway, after all active and retained
-- rollback images use the file. Keep the version keys and their foreign keys.
ALTER TABLE public.space_blueprint
    DROP COLUMN IF EXISTS geometry_schema_version,
    DROP COLUMN IF EXISTS geometry;
DROP TABLE IF EXISTS public.space_blueprint_runtime;

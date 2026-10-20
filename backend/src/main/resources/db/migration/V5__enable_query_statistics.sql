-- Instance preload settings and monitoring-role grants are managed outside Flyway.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE WARNING 'Skipping pg_stat_statements installation: insufficient privilege. Ask a database administrator to install it if query statistics are required.';
END;
$$;

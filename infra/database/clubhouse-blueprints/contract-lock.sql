BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('jarihana.clubhouse_contract_database', :'contract_database', true) AS approved_database \gset

DO $$
BEGIN
    IF current_database() <> current_setting('jarihana.clubhouse_contract_database') THEN
        RAISE EXCEPTION 'Connected to the wrong database for clubhouse blueprint cleanup';
    END IF;
END
$$;

LOCK TABLE public.space_blueprint_default IN SHARE MODE;
LOCK TABLE public.space_blueprint IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF to_regclass('public.space_blueprint_runtime') IS NOT NULL THEN
        LOCK TABLE public.space_blueprint_runtime IN ACCESS EXCLUSIVE MODE;
    END IF;
END
$$;

DO $$
DECLARE
    mismatch text;
    payload_columns integer;
    runtime_exists boolean := to_regclass('public.space_blueprint_runtime') IS NOT NULL;
BEGIN
    SELECT count(*) INTO payload_columns
    FROM pg_attribute
    WHERE attrelid = 'public.space_blueprint'::regclass
        AND attname IN ('geometry_schema_version', 'geometry')
        AND NOT attisdropped;

    IF (payload_columns, runtime_exists) NOT IN ((2, true), (0, false)) THEN
        RAISE EXCEPTION 'Clubhouse blueprint schema is only partially contracted';
    END IF;

    SELECT concat_ws(':', template_key, blueprint_version) INTO mismatch
    FROM public.space_blueprint actual
    LEFT JOIN pg_temp.clubhouse_expected_blueprint expected USING (template_key, blueprint_version)
    WHERE expected.template_key IS NULL
    ORDER BY template_key, blueprint_version
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Published blueprint key differs between database and file: %', mismatch;
    END IF;

    SELECT concat_ws(':', actual.template_key, actual.blueprint_version) INTO mismatch
    FROM public.space_blueprint_default actual
    LEFT JOIN pg_temp.clubhouse_expected_blueprint expected USING (template_key, blueprint_version)
    WHERE expected.default_room IS NULL
    ORDER BY actual.template_key
    LIMIT 1;
    IF FOUND THEN
        RAISE EXCEPTION 'Default blueprint cannot initialize a room from the file: %', mismatch;
    END IF;
    IF EXISTS (
        SELECT template_key FROM public.space_blueprint
        EXCEPT SELECT template_key FROM public.space_blueprint_default
    ) THEN
        RAISE EXCEPTION 'A clubhouse default blueprint key is missing';
    END IF;

    IF runtime_exists THEN
        SELECT concat_ws(':', template_key, blueprint_version) INTO mismatch
        FROM pg_temp.clubhouse_expected_blueprint expected
        JOIN public.space_blueprint actual USING (template_key, blueprint_version)
        LEFT JOIN public.space_blueprint_runtime runtime USING (template_key, blueprint_version)
        WHERE (expected.geometry_schema_version, expected.geometry, expected.spawn, expected.default_room)
            IS DISTINCT FROM (actual.geometry_schema_version, actual.geometry, runtime.spawn, runtime.default_room)
            OR runtime.template_key IS NULL
        ORDER BY template_key, blueprint_version
        LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'Published blueprint payload differs between database and file: %', mismatch;
        END IF;
        RAISE NOTICE 'Published blueprint keys and payloads match the file';
    ELSE
        RAISE NOTICE 'Published blueprint keys match the file and legacy payloads are absent';
    END IF;
END
$$;

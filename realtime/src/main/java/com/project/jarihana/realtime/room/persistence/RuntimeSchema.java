package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Component;

@Component
final class RuntimeSchema {
    private static final String READ_DATABASE = """
            SELECT EXISTS (
                SELECT 1 FROM space_blueprint b
                JOIN space_blueprint_runtime r USING (template_key, blueprint_version)
                WHERE b.template_key = 'lounge' AND b.blueprint_version = 11 AND b.geometry_schema_version = 1
                  AND jsonb_typeof(b.geometry->'building') = 'object' AND jsonb_typeof(b.geometry->'walls') = 'array'
                  AND jsonb_typeof(r.spawn->'x') = 'number' AND jsonb_typeof(r.spawn->'z') = 'number'
                  AND jsonb_typeof(r.default_room->'items') = 'array')
              AND EXISTS (SELECT 1 FROM space_blueprint_migration WHERE version = 1)
              AND EXISTS (SELECT 1 FROM space_runtime_migration WHERE version = 1)
              AND EXISTS (SELECT 1 FROM space_furniture_catalog_migration WHERE version = 1)
              AND EXISTS (SELECT 1 FROM space_portable_item_catalog_migration WHERE version = 1)
              AND NOT EXISTS (SELECT 1 FROM space_portable_item_catalog
                  WHERE kind IS NULL OR jsonb_typeof(definition) IS DISTINCT FROM 'object')
              AND EXISTS (SELECT 1 FROM space_blueprint_default WHERE template_key = 'lounge' AND blueprint_version IS NOT NULL)
              AND EXISTS (SELECT 1 FROM space_furniture_catalog WHERE kind = 'room-general-light-switch' AND NOT placeable
                  AND jsonb_typeof(definition->'surfaces') = 'array')
            """;
    private static final String CHECK_CATALOG = """
            WITH templates(template_key) AS (
                VALUES ('lounge'), ('climbing'), ('boardgame'), ('dining'), ('band'), ('study'), ('photo')
            ), seed(template_key, blueprint_version) AS (
                SELECT template_key, version FROM templates CROSS JOIN generate_series(6, 11) version
                UNION ALL SELECT 'lounge', 12
            ), supported AS (
                SELECT template_key, blueprint_version FROM space_blueprint b
                JOIN space_blueprint_runtime r USING (template_key, blueprint_version)
                WHERE b.geometry_schema_version = 1 AND jsonb_typeof(b.geometry->'building') = 'object'
                  AND jsonb_typeof(b.geometry->'walls') = 'array' AND jsonb_typeof(r.spawn->'x') = 'number'
                  AND jsonb_typeof(r.spawn->'z') = 'number'
            ), initial AS (
                SELECT template_key, blueprint_version FROM space_blueprint_runtime
                WHERE jsonb_typeof(default_room->'items') = 'array' AND default_room->>'template' = template_key
            ), furniture AS (
                SELECT kind FROM space_furniture_catalog WHERE jsonb_typeof(definition->'width') = 'number'
                  AND jsonb_typeof(definition->'depth') = 'number' AND jsonb_typeof(definition->'height') = 'number'
                  AND jsonb_typeof(definition->'surfaces') = 'array'
            )
            SELECT NOT EXISTS (SELECT * FROM seed EXCEPT SELECT * FROM supported)
              AND NOT EXISTS (SELECT * FROM seed WHERE blueprint_version >= 11 EXCEPT SELECT * FROM initial)
              AND NOT EXISTS (SELECT template_key FROM templates EXCEPT SELECT template_key FROM space_blueprint_default)
              AND NOT EXISTS (SELECT template_key, blueprint_version FROM space_blueprint_default EXCEPT SELECT * FROM initial)
              AND NOT EXISTS (SELECT template_key, blueprint_version FROM space_blueprint_default EXCEPT SELECT * FROM supported)
              AND NOT EXISTS (SELECT blueprint_template_key, blueprint_version FROM group_space EXCEPT SELECT * FROM supported)
              AND (SELECT count(kind) FROM furniture) >= 122
              AND NOT EXISTS (
                  SELECT item->>'kind' FROM space_blueprint_runtime r, jsonb_array_elements(r.default_room->'items') item
                  UNION ALL SELECT item->>'kind' FROM group_space s, jsonb_array_elements(s.room_json::jsonb->'items') item
                  EXCEPT SELECT kind FROM furniture)
            """;
    private final RealtimeDatabases databases;

    RuntimeSchema(RealtimeDatabases databases) {
        this.databases = databases;
    }

    void verify(RealtimeEnvironment environment, boolean fullCheck) {
        var client = databases.client(environment);
        if (!client.sql(READ_DATABASE).query(Boolean.class).single()) {
            throw new DataRetrievalFailureException("Runtime migration or catalog unreadable for " + environment);
        }
        if (fullCheck && !client.sql(CHECK_CATALOG).query(Boolean.class).single()) {
            throw new DataRetrievalFailureException("Incomplete runtime data for " + environment);
        }
    }
}

package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Component;

@Component
final class BlueprintSchema {
    private static final String READ_DATABASE = """
            SELECT EXISTS (
                SELECT 1 FROM space_blueprint_migration m, space_blueprint b, space_blueprint_default d
                WHERE m.version = 1 AND b.template_key = 'lounge' AND b.blueprint_version = 11
                  AND b.geometry_schema_version = 1 AND jsonb_typeof(b.geometry->'building') = 'object'
                  AND jsonb_typeof(b.geometry->'walls') = 'array'
                  AND d.template_key = 'lounge' AND d.blueprint_version IS NOT NULL)
            """;
    private static final String CHECK_CATALOG = """
                    WITH templates(template_key) AS (
                        VALUES ('lounge'), ('climbing'), ('boardgame'), ('dining'), ('band'), ('study'), ('photo')
                    ), seed(template_key, blueprint_version) AS (
                        SELECT template_key, version FROM templates CROSS JOIN generate_series(6, 11) version
                        UNION ALL SELECT 'lounge', 12
                    ), supported AS (
                        SELECT template_key, blueprint_version FROM space_blueprint
                        WHERE geometry_schema_version = 1 AND jsonb_typeof(geometry->'building') = 'object'
                          AND jsonb_typeof(geometry->'walls') = 'array'
                    )
                    SELECT NOT EXISTS (
                        SELECT * FROM seed EXCEPT SELECT * FROM supported
                    ) AND NOT EXISTS (
                        SELECT template_key FROM templates EXCEPT SELECT template_key FROM space_blueprint_default
                    ) AND NOT EXISTS (
                        SELECT template_key, blueprint_version FROM space_blueprint_default EXCEPT SELECT * FROM supported
                    ) AND NOT EXISTS (
                        SELECT blueprint_template_key, blueprint_version FROM group_space EXCEPT SELECT * FROM supported
                    )
                    """;
    private final RealtimeDatabases databases;

    BlueprintSchema(RealtimeDatabases databases) {
        this.databases = databases;
    }

    void verify(RealtimeEnvironment environment, boolean fullCheck) {
        var client = databases.client(environment);
        if (!client.sql(READ_DATABASE).query(Boolean.class).single()) {
            throw new DataRetrievalFailureException("Blueprint marker or catalog unreadable for " + environment);
        }
        if (fullCheck && !client.sql(CHECK_CATALOG).query(Boolean.class).single()) {
            throw new DataRetrievalFailureException("Incomplete blueprint catalog for " + environment);
        }
    }
}

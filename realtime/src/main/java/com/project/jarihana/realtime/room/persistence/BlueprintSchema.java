package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import java.util.EnumMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Component;

@Component
final class BlueprintSchema {
    enum Source { BUNDLED, DATABASE, UNAVAILABLE }

    // The legacy SELECT checks the same MVCC snapshot as the saved room.
    // group_space is mandatory even before V45. A missing/inaccessible schema must fail this probe.
    static final String SCHEMA_PRESENT = """
            (to_regclass('space_blueprint_migration') IS NOT NULL
             OR to_regclass('space_blueprint') IS NOT NULL
             OR to_regclass('space_blueprint_default') IS NOT NULL
             OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                        WHERE attrelid = 'group_space'::regclass AND NOT attisdropped
                          AND attname IN ('blueprint_template_key', 'blueprint_version')))
            """;
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
    private static final Logger log = LoggerFactory.getLogger(BlueprintSchema.class);
    private final RealtimeDatabases databases;
    private final Map<RealtimeEnvironment, State> states = new EnumMap<>(RealtimeEnvironment.class);

    BlueprintSchema(RealtimeDatabases databases) {
        this.databases = databases;
        for (var environment : RealtimeEnvironment.values()) states.put(environment, new State());
    }

    Source source(RealtimeEnvironment environment) {
        var state = states.get(environment);
        var current = state.source;
        if (current == null) {
            synchronized (state) {
                if (state.source == null) return verify(environment, false);
                current = state.source;
            }
        }
        if (current == Source.UNAVAILABLE) throw new DataRetrievalFailureException("Blueprint source unavailable for " + environment);
        return current;
    }

    Source schemaAppeared(RealtimeEnvironment environment) {
        var state = states.get(environment);
        synchronized (state) {
            // Concurrent joins that saw the same migration share its first complete validation.
            if (state.source == Source.BUNDLED) {
                state.databaseObserved = true;
                return verify(environment, false);
            }
            return source(environment);
        }
    }

    Source verify(RealtimeEnvironment environment, boolean fullCheck) {
        var state = states.get(environment);
        synchronized (state) {
            var client = databases.client(environment);
            try {
                if (!state.databaseObserved) {
                    state.databaseObserved = client.sql("SELECT " + SCHEMA_PRESENT).query(Boolean.class).single();
                }
                if (!state.databaseObserved) {
                    setSource(state, environment, Source.BUNDLED);
                    return Source.BUNDLED;
                }
                if (!client.sql(READ_DATABASE).query(Boolean.class).single()) {
                    throw new DataRetrievalFailureException("Blueprint marker or catalog unreadable for " + environment);
                }
                if (fullCheck || !state.catalogVerified) {
                    if (!client.sql(CHECK_CATALOG).query(Boolean.class).single()) {
                        throw new DataRetrievalFailureException("Incomplete blueprint catalog for " + environment);
                    }
                    state.catalogVerified = true;
                }
                setSource(state, environment, Source.DATABASE);
                return Source.DATABASE;
            } catch (DataAccessException error) {
                state.catalogVerified = false;
                setSource(state, environment, Source.UNAVAILABLE);
                throw error;
            }
        }
    }

    private static void setSource(State state, RealtimeEnvironment environment, Source source) {
        if (state.source != source) {
            log.info("Realtime blueprint source environment={} source={}", environment, source);
            state.source = source;
        }
    }

    private static final class State {
        private volatile Source source;
        private boolean databaseObserved;
        private boolean catalogVerified;
    }
}

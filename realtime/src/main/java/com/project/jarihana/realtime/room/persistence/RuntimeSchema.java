package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.layout.BlueprintCatalog;
import com.project.jarihana.realtime.layout.BlueprintRef;
import java.util.HashSet;
import java.util.Set;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
final class RuntimeSchema {
    private static final Set<String> ORIGINAL_TEMPLATES =
            Set.of("lounge", "climbing", "boardgame", "dining", "band", "study", "photo");
    private static final BlueprintRef LOFT_LOUNGE = new BlueprintRef("lounge", 12);
    private static final String READ_DATABASE = """
            SELECT EXISTS (
                SELECT 1 FROM space_blueprint WHERE template_key = 'lounge' AND blueprint_version = 11)
              AND EXISTS (SELECT 1 FROM space_blueprint_migration WHERE version = 1)
              AND EXISTS (SELECT 1 FROM space_runtime_migration WHERE version = 1)
              AND EXISTS (SELECT 1 FROM space_blueprint_default WHERE template_key = 'lounge' AND blueprint_version IS NOT NULL)
              AND EXISTS (SELECT 1 FROM space_furniture_catalog WHERE kind IS NOT NULL AND jsonb_typeof(definition->'surfaces') = 'array')
            """;
    private static final String VALID_FURNITURE = """
            SELECT kind FROM space_furniture_catalog
            WHERE jsonb_typeof(definition->'width') = 'number'
              AND jsonb_typeof(definition->'depth') = 'number'
              AND jsonb_typeof(definition->'height') = 'number'
              AND jsonb_typeof(definition->'surfaces') = 'array'
            """;
    private static final String STORED_REFS = """
            SELECT DISTINCT blueprint_template_key, blueprint_version FROM group_space
            """;
    private static final String STORED_KINDS = """
            SELECT DISTINCT item->>'kind' FROM group_space s, jsonb_array_elements(s.room_json::jsonb->'items') item
            """;
    private final RealtimeDatabases databases;
    private final BlueprintCatalog blueprints;

    RuntimeSchema(RealtimeDatabases databases, BlueprintCatalog blueprints) {
        this.databases = databases;
        this.blueprints = blueprints;
    }

    void verify(RealtimeEnvironment environment, boolean fullCheck) {
        var client = databases.client(environment);
        if (!client.sql(READ_DATABASE).query(Boolean.class).single()) {
            throw new DataRetrievalFailureException("Runtime migration or catalog unreadable for " + environment);
        }
        if (fullCheck && !catalogIsReady(client)) {
            throw new DataRetrievalFailureException("Incomplete runtime data for " + environment);
        }
    }

    private boolean catalogIsReady(JdbcClient client) {
        var published = refs(client, "SELECT template_key, blueprint_version FROM space_blueprint");
        var defaults = refs(client, "SELECT template_key, blueprint_version FROM space_blueprint_default");
        var selectedTemplates = new HashSet<String>();
        for (BlueprintRef ref : defaults) {
            selectedTemplates.add(ref.templateKey());
            if (blueprints.get(ref).defaultRoom() == null) return false;
        }
        if (!selectedTemplates.containsAll(ORIGINAL_TEMPLATES) || !published.containsAll(defaults)
                || !published.containsAll(refs(client, STORED_REFS)) || !hasOriginalPublications(published)) return false;

        var furniture = new HashSet<>(client.sql(VALID_FURNITURE).query(String.class).list());
        if (furniture.size() < 122 || !furniture.containsAll(client.sql(STORED_KINDS).query(String.class).list())) return false;
        for (BlueprintRef ref : published) {
            var defaultRoom = blueprints.get(ref).defaultRoom();
            if (defaultRoom == null) {
                if ((ref.version() == 11 && ORIGINAL_TEMPLATES.contains(ref.templateKey()))
                        || ref.equals(LOFT_LOUNGE)) return false;
                continue;
            }
            for (var item : defaultRoom.path("items")) {
                if (!furniture.contains(item.path("kind").asString())) return false;
            }
        }
        return true;
    }

    private static Set<BlueprintRef> refs(JdbcClient client, String sql) {
        return Set.copyOf(client.sql(sql).query((row, index) -> new BlueprintRef(row.getString(1), row.getInt(2))).list());
    }

    private static boolean hasOriginalPublications(Set<BlueprintRef> published) {
        for (String template : ORIGINAL_TEMPLATES) {
            for (int version = 6; version <= 11; version++) {
                if (!published.contains(new BlueprintRef(template, version))) return false;
            }
        }
        return published.contains(LOFT_LOUNGE);
    }
}

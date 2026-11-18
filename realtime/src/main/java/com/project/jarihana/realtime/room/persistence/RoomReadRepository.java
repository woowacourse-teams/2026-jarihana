package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.layout.BlueprintRef;
import com.project.jarihana.realtime.room.domain.AvatarAppearance;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public final class RoomReadRepository {
    private static final List<String> AVATAR_COLORS = List.of("#536bd6", "#c991ba", "#7b9b6d", "#d99559");
    private static final String ADMISSION_SQL = """
            SELECT m.crew_name, COALESCE(gm.role, 'GUEST') AS role, s.room_json, COALESCE(s.revision, 0) AS revision,
                   s.blueprint_template_key, s.blueprint_version,
                   a.version AS avatar_version, a.hair, a.skin, a.hair_color, a.face, a.eyes, a.eyebrows, a.nose,
                   a.mouth, a.glasses, a.outfit, a.shoes, a.shoe_color, a.hat, a.hat_color, a.bag, a.bag_color, a.handheld
            FROM groups g
            JOIN member m ON m.id = :memberId AND m.withdrawn_at IS NULL
            LEFT JOIN group_member gm ON gm.group_id = g.id AND gm.member_id = m.id
            LEFT JOIN group_space s ON s.group_id = g.id
            LEFT JOIN member_avatar a ON a.member_id = m.id
            WHERE g.id = :roomId AND g.type IN ('CLUB', 'STUDY') AND g.status = 'ACTIVE'
            """;
    private static final String LAYOUT_SQL = """
            SELECT s.room_json, COALESCE(s.revision, 0) AS revision, s.blueprint_template_key, s.blueprint_version
            FROM groups g
            LEFT JOIN group_space s ON s.group_id = g.id
            WHERE g.id = :roomId AND g.type IN ('CLUB', 'STUDY') AND g.status = 'ACTIVE'
            """;

    private final RealtimeDatabases databases;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final RealtimeProperties properties;
    private static final int GEOMETRY_CACHE_SIZE = 256;
    private final Map<EnvironmentBlueprint, JsonNode> geometries = Collections.synchronizedMap(
            new LinkedHashMap<>(32, 0.75f, true) {
                @Override protected boolean removeEldestEntry(Map.Entry<EnvironmentBlueprint, JsonNode> eldest) {
                    return size() > GEOMETRY_CACHE_SIZE;
                }
            });

    private record EnvironmentBlueprint(RealtimeEnvironment environment, BlueprintRef reference) {}

    RoomReadRepository(RealtimeDatabases databases, ObjectMapper mapper, Clock clock, RealtimeProperties properties) {
        this.databases = databases;
        this.mapper = mapper;
        this.clock = clock;
        this.properties = properties;
    }

    public Admission admission(RealtimeEnvironment environment, String roomId, String memberId) {
        long member = Long.parseLong(memberId);
        return admissionQuery(environment, Long.parseLong(roomId), member)
                .query((row, index) -> new Admission(roomId, memberId, row.getString("crew_name"),
                        AVATAR_COLORS.get((int) (member % AVATAR_COLORS.size())), readAvatar(row), row.getString("role"),
                        clock.millis() + properties.leaseValidity().toMillis(), row.getLong("revision"),
                        readRoom(row.getString("room_json")), blueprintRef(row)))
                .optional().orElseThrow(() -> new RuleViolation("ACCESS_DENIED"));
    }

    public StoredLayout layout(RealtimeEnvironment environment, String roomId) {
        return databases.client(environment).sql(LAYOUT_SQL).param("roomId", Long.parseLong(roomId))
                .query((row, index) -> new StoredLayout(row.getLong("revision"), readRoom(row.getString("room_json")), blueprintRef(row)))
                .optional().orElseThrow(() -> new RuleViolation("ACCESS_DENIED"));
    }

    private static BlueprintRef blueprintRef(ResultSet row) throws SQLException {
        if (row.getLong("revision") == 0) return BlueprintRef.UNSAVED_ROOM;
        return new BlueprintRef(row.getString("blueprint_template_key"), row.getInt("blueprint_version"));
    }

    public JsonNode geometry(RealtimeEnvironment environment, BlueprintRef ref) {
        EnvironmentBlueprint key = new EnvironmentBlueprint(environment, ref);
        JsonNode cached = geometries.get(key);
        if (cached != null) return cached;
        JsonNode geometry = databases.client(environment).sql("""
                SELECT geometry FROM space_blueprint
                WHERE template_key = :template AND blueprint_version = :version AND geometry_schema_version = 1
                  AND jsonb_typeof(geometry->'building') = 'object' AND jsonb_typeof(geometry->'walls') = 'array'
                """).param("template", ref.templateKey()).param("version", ref.version())
                .query((row, index) -> mapper.readTree(row.getString("geometry")))
                .optional().orElseThrow(() -> new RuleViolation("UNSUPPORTED_LAYOUT"));
        geometries.put(key, geometry);
        return geometry;
    }

    void verifyReadAccess(RealtimeEnvironment environment) {
        // Zero IDs can never pass token validation. The query still checks access to all required columns.
        admissionQuery(environment, 0, 0).query((row, index) -> row.getString("crew_name")).optional();
        boolean hasDefault = databases.client(environment).sql("""
                SELECT EXISTS (SELECT 1 FROM space_blueprint
                               WHERE template_key = 'lounge' AND blueprint_version = 11
                                 AND geometry_schema_version = 1 AND geometry IS NOT NULL)
                """).query(Boolean.class).single();
        if (!hasDefault) throw new IllegalStateException("Missing unsaved room blueprint for " + environment);
    }

    public void verifyBlueprintMigration() {
        for (RealtimeEnvironment environment : RealtimeEnvironment.values()) {
            verifyReadAccess(environment);
            boolean ready = databases.client(environment).sql("""
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
                    """).query(Boolean.class).single();
            if (!ready) throw new IllegalStateException("Incomplete or incompatible blueprint migration for " + environment);
        }
    }

    private StatementSpec admissionQuery(RealtimeEnvironment environment, long roomId, long memberId) {
        return databases.client(environment).sql(ADMISSION_SQL).param("roomId", roomId).param("memberId", memberId);
    }

    private static AvatarAppearance readAvatar(ResultSet row) throws SQLException {
        Integer version = row.getObject("avatar_version", Integer.class);
        if (version == null) return null;
        return new AvatarAppearance(version, row.getString("hair"), row.getString("skin"), row.getString("hair_color"),
                row.getString("face"), row.getString("eyes"), row.getString("eyebrows"), row.getString("nose"),
                row.getString("mouth"), row.getString("glasses"), row.getString("outfit"), row.getString("shoes"),
                row.getString("shoe_color"), row.getString("hat"), row.getString("hat_color"), row.getString("bag"),
                row.getString("bag_color"), row.getString("handheld"));
    }

    private JsonNode readRoom(String roomJson) {
        return roomJson == null ? null : mapper.readTree(roomJson);
    }

    public record StoredLayout(long revision, JsonNode room, BlueprintRef blueprint) {}
}

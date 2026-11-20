package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.auth.Admission;
import com.project.jarihana.realtime.config.RealtimeEnvironment;
import com.project.jarihana.realtime.config.RealtimeProperties;
import com.project.jarihana.realtime.layout.BlueprintRef;
import com.project.jarihana.realtime.layout.BlueprintRuntime;
import com.project.jarihana.realtime.room.domain.AvatarAppearance;
import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.jdbc.core.simple.JdbcClient.StatementSpec;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public final class RoomReadRepository {
    private static final List<String> AVATAR_COLORS = List.of("#536bd6", "#c991ba", "#7b9b6d", "#d99559");
    private static final String DATABASE_COLUMNS = """
            s.blueprint_template_key, s.blueprint_version,
            EXISTS (
                SELECT 1 FROM space_blueprint b JOIN space_blueprint_runtime r USING (template_key, blueprint_version)
                WHERE b.template_key = COALESCE(s.blueprint_template_key, 'lounge')
                  AND b.blueprint_version = COALESCE(s.blueprint_version, 11) AND b.geometry_schema_version = 1
                  AND b.geometry IS NOT NULL AND r.spawn IS NOT NULL AND (s.group_id IS NOT NULL OR r.default_room IS NOT NULL)
                  AND EXISTS (SELECT 1 FROM space_runtime_migration WHERE version = 1)
                  AND EXISTS (SELECT 1 FROM space_blueprint_migration WHERE version = 1)
                  AND EXISTS (SELECT 1 FROM space_blueprint_default WHERE template_key = 'lounge' AND blueprint_version IS NOT NULL)
                  AND EXISTS (SELECT 1 FROM space_furniture_catalog WHERE kind IS NOT NULL AND definition IS NOT NULL)
            ) AS runtime_readable
            """;
    private static final String ADMISSION_SQL = """
            SELECT m.crew_name, COALESCE(gm.role, 'GUEST') AS role, s.room_json, COALESCE(s.revision, 0) AS revision,
                   %s,
                   a.version AS avatar_version, a.hair, a.skin, a.hair_color, a.face, a.eyes, a.eyebrows, a.nose,
                   a.mouth, a.glasses, a.outfit, a.shoes, a.shoe_color, a.hat, a.hat_color, a.bag, a.bag_color, a.handheld
            FROM groups g
            JOIN member m ON m.id = :memberId AND m.withdrawn_at IS NULL
            LEFT JOIN group_member gm ON gm.group_id = g.id AND gm.member_id = m.id
            LEFT JOIN group_space s ON s.group_id = g.id
            LEFT JOIN member_avatar a ON a.member_id = m.id
            WHERE g.id = :roomId AND g.type IN ('CLUB', 'STUDY') AND g.status = 'ACTIVE'
            """.formatted(DATABASE_COLUMNS);
    private static final String LAYOUT_SQL = """
            SELECT s.room_json, COALESCE(s.revision, 0) AS revision, %s
            FROM groups g
            LEFT JOIN group_space s ON s.group_id = g.id
            WHERE g.id = :roomId AND g.type IN ('CLUB', 'STUDY') AND g.status = 'ACTIVE'
            """.formatted(DATABASE_COLUMNS);

    private final RealtimeDatabases databases;
    private final RuntimeSchema schema;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final RealtimeProperties properties;
    private static final int BLUEPRINT_CACHE_SIZE = 256;
    private final Map<EnvironmentBlueprint, BlueprintRuntime> blueprints = Collections.synchronizedMap(
            new LinkedHashMap<>(32, 0.75f, true) {
                @Override protected boolean removeEldestEntry(Map.Entry<EnvironmentBlueprint, BlueprintRuntime> eldest) {
                    return size() > BLUEPRINT_CACHE_SIZE;
                }
            });

    private final Map<RealtimeEnvironment, JsonNode> furniture = new ConcurrentHashMap<>();

    private record EnvironmentBlueprint(RealtimeEnvironment environment, BlueprintRef reference) {}

    RoomReadRepository(RealtimeDatabases databases, RuntimeSchema schema, ObjectMapper mapper, Clock clock, RealtimeProperties properties) {
        this.databases = databases;
        this.schema = schema;
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
        return databases.client(environment).sql(LAYOUT_SQL)
                .param("roomId", Long.parseLong(roomId))
                .query((row, index) -> new StoredLayout(row.getLong("revision"),
                        readRoom(row.getString("room_json")), blueprintRef(row)))
                .optional().orElseThrow(() -> new RuleViolation("ACCESS_DENIED"));
    }

    private static BlueprintRef blueprintRef(ResultSet row) throws SQLException {
        if (!row.getBoolean("runtime_readable")) throw new DataRetrievalFailureException("Runtime data for pinned room is unreadable");
        if (row.getLong("revision") == 0) return BlueprintRef.UNSAVED_ROOM;
        return new BlueprintRef(row.getString("blueprint_template_key"), row.getInt("blueprint_version"));
    }

    public BlueprintRuntime blueprint(RealtimeEnvironment environment, BlueprintRef ref) {
        var key = new EnvironmentBlueprint(environment, ref);
        var cached = blueprints.get(key);
        if (cached != null) return cached;
        var blueprint = databases.client(environment).sql("""
                SELECT b.geometry, r.spawn, r.default_room FROM space_blueprint b
                JOIN space_blueprint_runtime r USING (template_key, blueprint_version)
                WHERE b.template_key = :template AND b.blueprint_version = :version AND b.geometry_schema_version = 1
                  AND jsonb_typeof(b.geometry->'building') = 'object' AND jsonb_typeof(b.geometry->'walls') = 'array'
                """).param("template", ref.templateKey()).param("version", ref.version())
                .query((row, index) -> {
                    JsonNode spawn = mapper.readTree(row.getString("spawn"));
                    return new BlueprintRuntime(mapper.readTree(row.getString("geometry")),
                            new Vec3(spawn.path("x").doubleValue(), 0, spawn.path("z").doubleValue()),
                            readRoom(row.getString("default_room")));
                }).optional().orElseThrow(() -> new DataRetrievalFailureException("Missing or incompatible pinned blueprint"));
        blueprints.put(key, blueprint);
        return blueprint;
    }

    // Existing kinds have immutable physics. Refresh only when a room uses a newly published kind.
    public JsonNode furniture(RealtimeEnvironment environment, JsonNode room) {
        JsonNode definitions = furniture.get(environment);
        if (definitions != null) {
            boolean known = true;
            for (JsonNode item : room.path("items")) {
                if (!definitions.has(item.path("kind").asString())) { known = false; break; }
            }
            if (known) return definitions;
        }
        JsonNode current = databases.client(environment).sql("""
                SELECT jsonb_object_agg(kind, definition) FROM space_furniture_catalog
                """).query((row, index) -> readRoom(row.getString(1)))
                .optional().orElseThrow(() -> new DataRetrievalFailureException("Empty furniture catalog for " + environment));
        furniture.put(environment, current);
        return current;
    }

    public void verifyReadAccess(RealtimeEnvironment environment) {
        verifyReadAccess(environment, false);
    }

    private void verifyReadAccess(RealtimeEnvironment environment, boolean fullCheck) {
        schema.verify(environment, fullCheck);
        // Zero IDs still exercise permissions on every admission and group_space column.
        admissionQuery(environment, 0, 0).query((row, index) -> row.getString("crew_name")).optional();
    }

    public void verifyRuntimeMigration() {
        for (RealtimeEnvironment environment : RealtimeEnvironment.values()) verifyReadAccess(environment, true);
    }

    private StatementSpec admissionQuery(RealtimeEnvironment environment, long roomId, long memberId) {
        return databases.client(environment).sql(ADMISSION_SQL)
                .param("roomId", roomId).param("memberId", memberId);
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

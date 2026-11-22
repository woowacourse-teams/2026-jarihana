package com.project.jarihana.realtime.layout;

import com.project.jarihana.realtime.room.domain.Vec3;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataRetrievalFailureException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public final class BlueprintCatalog {
    private static final ClassPathResource INDEX = new ClassPathResource("contracts/clubhouse/blueprints/index.json");
    private static final Pattern VERSION_FILE = Pattern.compile("[a-z][a-z0-9-]*/v[1-9][0-9]*\\.json");
    private final Map<BlueprintRef, BlueprintRuntime> blueprints;

    public BlueprintCatalog(ObjectMapper mapper) throws IOException {
        blueprints = load(mapper);
        if (get(BlueprintRef.UNSAVED_ROOM).defaultRoom() == null) {
            throw new IllegalStateException("Missing initial room for the legacy visitor blueprint");
        }
    }

    public BlueprintRuntime get(BlueprintRef ref) {
        var blueprint = blueprints.get(ref);
        if (blueprint == null) {
            throw new DataRetrievalFailureException("Missing packaged blueprint " + ref);
        }
        return blueprint;
    }

    private static Map<BlueprintRef, BlueprintRuntime> load(ObjectMapper mapper) throws IOException {
        JsonNode paths = read(mapper, INDEX);
        if (!paths.isArray() || paths.isEmpty()) throw new IllegalStateException("Invalid clubhouse blueprint index");
        Map<BlueprintRef, BlueprintRuntime> entries = new HashMap<>();
        for (JsonNode value : paths) {
            String path = value.asString();
            if (!value.isString() || !VERSION_FILE.matcher(path).matches()) {
                throw new IllegalStateException("Invalid clubhouse blueprint path " + value);
            }
            JsonNode blueprint = read(mapper, INDEX.createRelative(path));
            JsonNode template = blueprint.path("templateKey");
            JsonNode version = blueprint.path("blueprintVersion");
            JsonNode geometrySchema = blueprint.path("geometrySchemaVersion");
            JsonNode geometry = blueprint.path("geometry");
            JsonNode spawn = blueprint.path("spawn");
            JsonNode defaultRoom = blueprint.path("defaultRoom");
            var ref = new BlueprintRef(template.asString(), version.asInt());
            if (!template.isString() || ref.templateKey().isBlank()
                    || !version.isIntegralNumber() || !version.canConvertToInt() || ref.version() < 1
                    || !path.equals(ref.templateKey() + "/v" + ref.version() + ".json")
                    || !geometrySchema.isIntegralNumber() || !geometrySchema.canConvertToInt() || geometrySchema.intValue() != 1
                    || !geometry.path("building").isObject() || !geometry.path("walls").isArray()
                    || !finiteCoordinate(spawn.path("x")) || !finiteCoordinate(spawn.path("z"))
                    || !validDefault(defaultRoom, ref)) {
                throw new IllegalStateException("Invalid packaged blueprint " + ref);
            }
            var runtime = new BlueprintRuntime(geometry,
                    new Vec3(spawn.path("x").doubleValue(), 0, spawn.path("z").doubleValue()),
                    defaultRoom.isNull() ? null : defaultRoom);
            if (entries.putIfAbsent(ref, runtime) != null) {
                throw new IllegalStateException("Duplicate packaged blueprint " + ref);
            }
        }
        return Map.copyOf(entries);
    }

    private static JsonNode read(ObjectMapper mapper, Resource resource) throws IOException {
        try (var input = resource.getInputStream()) {
            return mapper.readTree(input);
        }
    }

    private static boolean finiteCoordinate(JsonNode value) {
        return value.isNumber() && Double.isFinite(value.doubleValue());
    }

    private static boolean validDefault(JsonNode room, BlueprintRef ref) {
        JsonNode version = room.path("version");
        return room.isNull() || (room.isObject() && ref.templateKey().equals(room.path("template").asString())
                && version.isIntegralNumber() && version.canConvertToInt() && version.intValue() >= 11
                && room.path("items").isArray());
    }
}

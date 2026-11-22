package com.project.jarihana.realtime.layout;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class TestBlueprints {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final BlueprintCatalog BLUEPRINTS = blueprints();
    public static final JsonNode FURNITURE = furniture();

    public static BlueprintRuntime runtime(String key) {
        var parts = key.split(":", 2);
        return BLUEPRINTS.get(new BlueprintRef(parts[1], Integer.parseInt(parts[0])));
    }

    private static JsonNode furniture() {
        var definitions = MAPPER.createObjectNode();
        for (JsonNode item : seedArray("V46__space_furniture_catalog.sql", "$catalog$")) {
            definitions.set(item.path("kind").asString(), item);
        }
        return definitions;
    }

    private static JsonNode seedArray(String migration, String delimiter) {
        try {
            String sql = new ClassPathResource(migration).getContentAsString(StandardCharsets.UTF_8);
            int start = sql.indexOf(delimiter) + delimiter.length();
            return MAPPER.readTree(sql.substring(start, sql.indexOf(delimiter, start)));
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
    }

    private TestBlueprints() {}

    public static JsonNode geometry(String key) {
        return runtime(key).geometry();
    }

    private static BlueprintCatalog blueprints() {
        try {
            return new BlueprintCatalog(MAPPER);
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
    }
}
